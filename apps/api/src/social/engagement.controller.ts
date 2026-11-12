import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  socialCommentPageResponseSchema,
  type SocialCommentRequest,
  socialCommentRequestSchema,
  type SocialCommentsQuery,
  socialCommentsQuerySchema,
  socialCreatedResponseSchema,
  socialIdPathSchema,
  type SocialReactionRequest,
  socialReactionRequestSchema,
  socialReactorsResponseSchema,
} from "@pt/contracts";

import type { AuthActor } from "../auth/actor.js";
import { Actor } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { ApiPathParams, ApiQueries } from "../workouts/workouts.openapi.js";
import { EngagementService } from "./engagement.service.js";
import { toCommentResponse } from "./mappers.js";
import { toSocialActor } from "./social-actor.js";
import { SocialTermsGuard } from "./terms.guard.js";

type IdParams = { id: number };

// Reactions and comments, for trainees (after the terms) and admins alike.
@ApiTags("social")
@ApiBearerAuth()
@Controller("social")
@UseGuards(SocialTermsGuard)
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  // Set or change my one reaction; DELETE removes it.
  @Put("posts/:id/reaction")
  @HttpCode(204)
  @ApiPathParams("id")
  @ApiBody({ schema: toOpenApiSchema(socialReactionRequestSchema, "input") })
  @ApiNoContentResponse({ description: "Reaction set" })
  @ApiErrors(400, 401, 403, 404)
  async react(
    @Actor() actor: AuthActor,
    @Param({ schema: socialIdPathSchema }) params: IdParams,
    @Body({ schema: socialReactionRequestSchema }) body: SocialReactionRequest,
  ): Promise<void> {
    await this.engagement.react(toSocialActor(actor), params.id, body.emoji);
  }

  @Delete("posts/:id/reaction")
  @HttpCode(204)
  @ApiPathParams("id")
  @ApiNoContentResponse({ description: "Reaction removed" })
  @ApiErrors(401, 403, 404)
  async unreact(
    @Actor() actor: AuthActor,
    @Param({ schema: socialIdPathSchema }) params: IdParams,
  ): Promise<void> {
    await this.engagement.removeReaction(toSocialActor(actor), params.id);
  }

  @Get("posts/:id/reactions")
  @ApiPathParams("id")
  @ApiOkResponse({ schema: toOpenApiSchema(socialReactorsResponseSchema) })
  @ApiErrors(401, 403, 404)
  async reactors(
    @Actor() actor: AuthActor,
    @Param({ schema: socialIdPathSchema }) params: IdParams,
  ) {
    return {
      items: await this.engagement.listReactors(toSocialActor(actor), params.id),
    };
  }

  // Oldest first. Comments of people blocked either way are left out.
  @Get("posts/:id/comments")
  @ApiPathParams("id")
  @ApiQueries(
    { name: "cursor", description: "Opaque, from nextCursor" },
    { name: "limit", description: "1 to 100, default 50" },
  )
  @ApiOkResponse({ schema: toOpenApiSchema(socialCommentPageResponseSchema) })
  @ApiErrors(400, 401, 403, 404)
  async comments(
    @Actor() actor: AuthActor,
    @Param({ schema: socialIdPathSchema }) params: IdParams,
    @Query({ schema: socialCommentsQuerySchema }) query: SocialCommentsQuery,
  ) {
    const page = await this.engagement.listComments(
      toSocialActor(actor),
      params.id,
      query.cursor,
      query.limit,
    );

    return {
      items: page.items.map(toCommentResponse),
      nextCursor: page.nextCursor,
    };
  }

  @Post("posts/:id/comments")
  @HttpCode(201)
  @ApiPathParams("id")
  @ApiBody({ schema: toOpenApiSchema(socialCommentRequestSchema, "input") })
  @ApiCreatedResponse({ schema: toOpenApiSchema(socialCreatedResponseSchema) })
  @ApiErrors(400, 401, 403, 404)
  async addComment(
    @Actor() actor: AuthActor,
    @Param({ schema: socialIdPathSchema }) params: IdParams,
    @Body({ schema: socialCommentRequestSchema }) body: SocialCommentRequest,
  ) {
    return {
      id: await this.engagement.addComment(
        toSocialActor(actor),
        params.id,
        body.body,
      ),
    };
  }

  @Patch("comments/:id")
  @HttpCode(204)
  @ApiPathParams("id")
  @ApiBody({ schema: toOpenApiSchema(socialCommentRequestSchema, "input") })
  @ApiNoContentResponse({ description: "Comment edited" })
  @ApiErrors(400, 401, 403, 404)
  async editComment(
    @Actor() actor: AuthActor,
    @Param({ schema: socialIdPathSchema }) params: IdParams,
    @Body({ schema: socialCommentRequestSchema }) body: SocialCommentRequest,
  ): Promise<void> {
    await this.engagement.editComment(toSocialActor(actor), params.id, body.body);
  }

  @Delete("comments/:id")
  @HttpCode(204)
  @ApiPathParams("id")
  @ApiNoContentResponse({ description: "Comment deleted (text emptied)" })
  @ApiErrors(401, 403, 404)
  async deleteComment(
    @Actor() actor: AuthActor,
    @Param({ schema: socialIdPathSchema }) params: IdParams,
  ): Promise<void> {
    await this.engagement.deleteComment(toSocialActor(actor), params.id);
  }
}
