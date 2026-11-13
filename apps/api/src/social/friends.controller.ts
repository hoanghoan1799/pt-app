import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  type SocialFriendRequest,
  socialFriendRequestSchema,
  socialFriendRequestsResponseSchema,
  socialFriendsResponseSchema,
  type SocialPeopleQuery,
  socialPeopleQuerySchema,
  socialPeopleResponseSchema,
  socialSendFriendRequestResponseSchema,
  socialUserIdPathSchema,
} from "@pt/contracts";

import type { AuthActor } from "../auth/actor.js";
import { Actor, Roles } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { ApiPathParams, ApiQueries } from "../workouts/workouts.openapi.js";
import { FriendsService } from "./friends.service.js";
import { SocialTermsGuard } from "./terms.guard.js";

type UserParams = { userId: number };

// Friends, friend requests and blocks: trainees only, after the terms.
@ApiTags("social")
@Controller("social")
@Roles("trainee")
@UseGuards(SocialTermsGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  // Exact-email search (Q5): the whole address, never a prefix.
  @Get("people")
  @ApiQueries({ name: "email", required: true, description: "Full address" })
  @ApiOkResponse({ schema: toOpenApiSchema(socialPeopleResponseSchema) })
  @ApiErrors(400, 401, 403)
  async search(
    @Actor() actor: AuthActor,
    @Query({ schema: socialPeopleQuerySchema }) query: SocialPeopleQuery,
  ) {
    return { result: await this.friends.searchByEmail(actor.id, query.email) };
  }

  @Get("friends")
  @ApiOkResponse({ schema: toOpenApiSchema(socialFriendsResponseSchema) })
  @ApiErrors(401, 403)
  async list(@Actor() actor: AuthActor) {
    return { items: await this.friends.listFriends(actor.id) };
  }

  @Get("friends/requests")
  @ApiOkResponse({
    schema: toOpenApiSchema(socialFriendRequestsResponseSchema),
  })
  @ApiErrors(401, 403)
  requests(@Actor() actor: AuthActor) {
    return this.friends.listRequests(actor.id);
  }

  @Post("friends/requests")
  @HttpCode(201)
  @ApiBody({ schema: toOpenApiSchema(socialFriendRequestSchema, "input") })
  @ApiCreatedResponse({
    schema: toOpenApiSchema(socialSendFriendRequestResponseSchema),
  })
  @ApiErrors(400, 401, 403, 404, 409, 429)
  send(
    @Actor() actor: AuthActor,
    @Body({ schema: socialFriendRequestSchema }) body: SocialFriendRequest,
  ) {
    return this.friends.sendRequest(actor.id, body.userId);
  }

  @Post("friends/requests/:userId/accept")
  @HttpCode(204)
  @ApiPathParams("userId")
  @ApiNoContentResponse({ description: "Accepted" })
  @ApiErrors(401, 403, 404)
  async accept(
    @Actor() actor: AuthActor,
    @Param({ schema: socialUserIdPathSchema }) params: UserParams,
  ): Promise<void> {
    await this.friends.accept(actor.id, params.userId);
  }

  @Post("friends/requests/:userId/decline")
  @HttpCode(204)
  @ApiPathParams("userId")
  @ApiNoContentResponse({ description: "Declined" })
  @ApiErrors(401, 403, 404)
  async decline(
    @Actor() actor: AuthActor,
    @Param({ schema: socialUserIdPathSchema }) params: UserParams,
  ): Promise<void> {
    await this.friends.decline(actor.id, params.userId);
  }

  // The asker takes the request back.
  @Delete("friends/requests/:userId")
  @HttpCode(204)
  @ApiPathParams("userId")
  @ApiNoContentResponse({ description: "Request cancelled" })
  @ApiErrors(401, 403, 404)
  async cancel(
    @Actor() actor: AuthActor,
    @Param({ schema: socialUserIdPathSchema }) params: UserParams,
  ): Promise<void> {
    await this.friends.cancel(actor.id, params.userId);
  }

  @Delete("friends/:userId")
  @HttpCode(204)
  @ApiPathParams("userId")
  @ApiNoContentResponse({ description: "Unfriended" })
  @ApiErrors(401, 403, 404)
  async unfriend(
    @Actor() actor: AuthActor,
    @Param({ schema: socialUserIdPathSchema }) params: UserParams,
  ): Promise<void> {
    await this.friends.unfriend(actor.id, params.userId);
  }

  // People I blocked (not the ones who blocked me).
  @Get("blocks")
  @ApiOkResponse({ schema: toOpenApiSchema(socialFriendsResponseSchema) })
  @ApiErrors(401, 403)
  async blocks(@Actor() actor: AuthActor) {
    return { items: await this.friends.listBlockedByMe(actor.id) };
  }

  @Put("blocks/:userId")
  @HttpCode(204)
  @ApiPathParams("userId")
  @ApiNoContentResponse({ description: "Blocked (idempotent)" })
  @ApiErrors(401, 403, 404)
  async block(
    @Actor() actor: AuthActor,
    @Param({ schema: socialUserIdPathSchema }) params: UserParams,
  ): Promise<void> {
    await this.friends.block(actor.id, params.userId);
  }

  @Delete("blocks/:userId")
  @HttpCode(204)
  @ApiPathParams("userId")
  @ApiNoContentResponse({ description: "Unblocked" })
  @ApiErrors(401, 403, 404)
  async unblock(
    @Actor() actor: AuthActor,
    @Param({ schema: socialUserIdPathSchema }) params: UserParams,
  ): Promise<void> {
    await this.friends.unblock(actor.id, params.userId);
  }
}
