import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  SOCIAL_IDEMPOTENCY_KEY_PATTERN,
  SOCIAL_TERMS_VERSION,
  type SocialCreatePostRequest,
  socialCreatePostRequestSchema,
  socialCreatePostResponseSchema,
  type SocialEditPostRequest,
  socialEditPostRequestSchema,
  socialIdPathSchema,
  type SocialMeResponse,
  socialMeResponseSchema,
  type SocialPostPageResponse,
  socialPostPageResponseSchema,
  type SocialPostResponse,
  socialPostResponseSchema,
  type SocialPostsQuery,
  socialPostsQuerySchema,
  socialProfilePathSchema,
  type SocialProfileResponse,
  socialProfileResponseSchema,
} from "@pt/contracts";
import type { Response } from "express";

import type { AuthActor } from "../auth/actor.js";
import { Actor } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { AccountDirectory } from "../users/account-directory.service.js";
import { ApiPathParams, ApiQueries } from "../workouts/workouts.openapi.js";
import { decodeIdCursor } from "./domain/cursor.js";
import {
  toPostPageResponse,
  toPostResponse,
  toProfileResponse,
} from "./mappers.js";
import { NotificationsService } from "./notifications/notifications.service.js";
import { PostQueries } from "./posts.queries.js";
import { PostsService } from "./posts.service.js";
import { ProfilesService } from "./profiles.service.js";
import { idempotencyKeyInvalid, postNotFound } from "./social.errors.js";
import { keyOf, toSocialActor } from "./social-actor.js";
import { SkipTerms, SocialTermsGuard } from "./terms.guard.js";

const pageQueries = [
  { name: "cursor", description: "Opaque, from nextCursor" },
  { name: "limit", description: "1 to 50, default 10" },
];

// Feed, posts and profiles. A trainee needs the accepted terms (except for the
// two routes below); an admin does not.
@ApiTags("social")
@ApiBearerAuth()
@Controller("social")
@UseGuards(SocialTermsGuard)
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly queries: PostQueries,
    private readonly profiles: ProfilesService,
    private readonly accounts: AccountDirectory,
    private readonly notifications: NotificationsService,
  ) {}

  // What the feed page needs before it shows anything: the terms state, the
  // composer's starting privacy and the bell's unread count.
  @Get("me")
  @SkipTerms()
  @ApiOkResponse({ schema: toOpenApiSchema(socialMeResponseSchema) })
  @ApiErrors(401, 403)
  async me(@Actor() actor: AuthActor): Promise<SocialMeResponse> {
    const social = toSocialActor(actor);
    const version =
      social.kind === "user" ? await this.accounts.termsVersion(social.id) : null;

    return {
      kind: social.kind,
      id: social.id,
      termsAccepted:
        social.kind === "admin" ||
        (version !== null && version >= SOCIAL_TERMS_VERSION),
      termsVersion: SOCIAL_TERMS_VERSION,
      postPrivacyDefault:
        social.kind === "user"
          ? await this.accounts.postPrivacyDefault(social.id)
          : "everyone",
      unreadNotifications: await this.notifications.unreadCount(keyOf(social)),
    };
  }

  @Post("me/terms")
  @SkipTerms()
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Terms accepted (trainees)" })
  @ApiErrors(401, 403)
  async acceptTerms(@Actor() actor: AuthActor): Promise<void> {
    if (actor.kind === "user") {
      await this.posts.acceptTerms(actor.id);
    }
  }

  // A trainee's home feed, or an admin's feed of everything they may see.
  @Get("feed")
  @ApiQueries(...pageQueries)
  @ApiOkResponse({ schema: toOpenApiSchema(socialPostPageResponseSchema) })
  @ApiErrors(400, 401, 403)
  async feed(
    @Actor() actor: AuthActor,
    @Query({ schema: socialPostsQuerySchema }) query: SocialPostsQuery,
  ): Promise<SocialPostPageResponse> {
    const viewer = toSocialActor(actor);
    const cursor = query.cursor ? decodeIdCursor(query.cursor) : null;

    return toPostPageResponse(
      viewer.kind === "user"
        ? await this.queries.listUserFeed(viewer, cursor, query.limit)
        : await this.queries.listAdminFeed(viewer, cursor, query.limit),
    );
  }

  // `Idempotency-Key`: a retry with the same key returns the first post and
  // creates nothing (header `Idempotent-Replayed: true`).
  @Post("posts")
  @HttpCode(201)
  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description: "1 to 128 characters of A-Z a-z 0-9 . _ : -",
  })
  @ApiBody({ schema: toOpenApiSchema(socialCreatePostRequestSchema, "input") })
  @ApiCreatedResponse({ schema: toOpenApiSchema(socialCreatePostResponseSchema) })
  @ApiErrors(400, 401, 403, 404)
  async create(
    @Actor() actor: AuthActor,
    @Body({ schema: socialCreatePostRequestSchema })
    body: SocialCreatePostRequest,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ post: SocialPostResponse }> {
    if (key !== undefined && !SOCIAL_IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw idempotencyKeyInvalid();
    }
    const viewer = toSocialActor(actor);
    const { postId, replayed } = await this.posts.create(
      viewer,
      body,
      key ?? null,
    );
    const view = await this.queries.getPostView(viewer, postId);

    if (!view) {
      throw postNotFound();
    }
    if (replayed) {
      res.setHeader("Idempotent-Replayed", "true");
    }
    return { post: toPostResponse(view) };
  }

  @Get("posts/:id")
  @ApiPathParams("id")
  @ApiOkResponse({ schema: toOpenApiSchema(socialPostResponseSchema) })
  @ApiErrors(401, 403, 404)
  async get(
    @Actor() actor: AuthActor,
    @Param({ schema: socialIdPathSchema }) params: { id: number },
  ): Promise<SocialPostResponse> {
    const view = await this.queries.getPostView(toSocialActor(actor), params.id);

    if (!view) {
      throw postNotFound();
    }
    return toPostResponse(view);
  }

  @Patch("posts/:id")
  @HttpCode(204)
  @ApiPathParams("id")
  @ApiBody({ schema: toOpenApiSchema(socialEditPostRequestSchema, "input") })
  @ApiNoContentResponse({ description: "Caption and privacy changed" })
  @ApiErrors(400, 401, 403, 404)
  async edit(
    @Actor() actor: AuthActor,
    @Param({ schema: socialIdPathSchema }) params: { id: number },
    @Body({ schema: socialEditPostRequestSchema }) body: SocialEditPostRequest,
  ): Promise<void> {
    await this.posts.edit(toSocialActor(actor), params.id, body);
  }

  @Delete("posts/:id")
  @HttpCode(204)
  @ApiPathParams("id")
  @ApiNoContentResponse({ description: "Deleted with its photo and engagement" })
  @ApiErrors(401, 403, 404)
  async remove(
    @Actor() actor: AuthActor,
    @Param({ schema: socialIdPathSchema }) params: { id: number },
  ): Promise<void> {
    await this.posts.delete(toSocialActor(actor), params.id);
  }

  // `:key` is "user:12" or "admin:3".
  @Get("profiles/:key")
  @ApiPathParams("key")
  @ApiOkResponse({ schema: toOpenApiSchema(socialProfileResponseSchema) })
  @ApiErrors(400, 401, 403, 404)
  async profile(
    @Actor() actor: AuthActor,
    @Param({ schema: socialProfilePathSchema })
    params: { key: { kind: "user" | "admin"; id: number } },
  ): Promise<SocialProfileResponse> {
    return toProfileResponse(
      await this.profiles.get(toSocialActor(actor), params.key),
    );
  }

  // One person's posts, filtered with the rules of the post policy.
  @Get("profiles/:key/posts")
  @ApiPathParams("key")
  @ApiQueries(...pageQueries)
  @ApiOkResponse({ schema: toOpenApiSchema(socialPostPageResponseSchema) })
  @ApiErrors(400, 401, 403, 404)
  async profilePosts(
    @Actor() actor: AuthActor,
    @Param({ schema: socialProfilePathSchema })
    params: { key: { kind: "user" | "admin"; id: number } },
    @Query({ schema: socialPostsQuerySchema }) query: SocialPostsQuery,
  ): Promise<SocialPostPageResponse> {
    const viewer = toSocialActor(actor);

    await this.profiles.assertViewable(viewer, params.key);
    return toPostPageResponse(
      await this.queries.listProfilePosts(
        viewer,
        params.key,
        query.cursor ? decodeIdCursor(query.cursor) : null,
        query.limit,
      ),
    );
  }
}
