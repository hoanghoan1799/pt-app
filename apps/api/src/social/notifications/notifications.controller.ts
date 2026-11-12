import { Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  socialNotificationPageResponseSchema,
  type SocialNotificationsQuery,
  socialNotificationsQuerySchema,
} from "@pt/contracts";

import type { AuthActor } from "../../auth/actor.js";
import { Actor } from "../../auth/decorators/index.js";
import { ApiErrors } from "../../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../../common/openapi/zod-schema.js";
import { ApiQueries } from "../../workouts/workouts.openapi.js";
import { toNotificationPageResponse } from "../mappers.js";
import { keyOf, toSocialActor } from "../social-actor.js";
import { SocialTermsGuard } from "../terms.guard.js";
import { NotificationsService } from "./notifications.service.js";

// A person's own notifications (trainee or admin).
@ApiTags("social")
@ApiBearerAuth()
@Controller("social/notifications")
@UseGuards(SocialTermsGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // Newest first. Reading does not mark them read; POST /read does.
  @Get()
  @ApiQueries(
    { name: "cursor", description: "Opaque, from nextCursor" },
    { name: "limit", description: "1 to 100, default 50" },
  )
  @ApiOkResponse({ schema: toOpenApiSchema(socialNotificationPageResponseSchema) })
  @ApiErrors(400, 401, 403)
  async list(
    @Actor() actor: AuthActor,
    @Query({ schema: socialNotificationsQuerySchema })
    query: SocialNotificationsQuery,
  ) {
    return toNotificationPageResponse(
      await this.notifications.list(
        toSocialActor(actor),
        query.cursor,
        query.limit,
      ),
    );
  }

  @Post("read")
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Every notification marked read" })
  @ApiErrors(401, 403)
  async markRead(@Actor() actor: AuthActor): Promise<void> {
    await this.notifications.markAllRead(keyOf(toSocialActor(actor)));
  }
}
