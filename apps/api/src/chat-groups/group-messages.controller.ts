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
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  type GroupEditMessageRequest,
  groupEditMessageRequestSchema,
  groupEditsResponseSchema,
  type GroupHideRequest,
  groupHideRequestSchema,
  type GroupMarkReadRequest,
  groupMarkReadRequestSchema,
  groupMessageResponseSchema,
  groupPhotoResponseSchema,
  type GroupReactRequest,
  groupReactRequestSchema,
  groupReadResponseSchema,
  type GroupResolveAlertRequest,
  groupResolveAlertRequestSchema,
  groupSeenByResponseSchema,
  type GroupSendMessageRequest,
  groupSendMessageRequestSchema,
  type GroupThreadQuery,
  groupThreadQuerySchema,
  groupThreadResponseSchema,
  idParamSchema,
} from "@pt/contracts";
import type { Request, Response } from "express";

import type { AdminActor, AuthActor } from "../auth/actor.js";
import { Actor, Admin, Roles } from "../auth/decorators/index.js";
import {
  IDEMPOTENCY_HEADER,
  parseIdempotencyKey,
} from "../chat/idempotency.js";
import { ApiRoute } from "../common/openapi/api-route.js";
import { RefuseRestricted } from "../restrictions/restriction.guard.js";
import { groupErrors } from "./group.errors.js";
import { GroupAlertsService } from "./group-alerts.service.js";
import { GroupMessagesService } from "./group-messages.service.js";
import { GroupPhotosService } from "./group-photos.service.js";

const idParam = { schema: idParamSchema };

// The raw image bytes of an upload (the browser has already resized and
// re-encoded them); the type is read from the bytes, never from the header.
const bytesOf = (request: Request) => {
  const body: unknown = request.body;

  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw groupErrors.badImage();
  }
  return body;
};

// A group's thread and messages. Every route loads the caller's place in the
// group first (GroupAccess); a message of another group is "not found". A
// restricted trainee may read, mark read, unsend and report, nothing else
// (@RefuseRestricted, PR #38).
@ApiTags("chat-groups")
@Controller("chat/groups/:groupId")
export class GroupMessagesController {
  constructor(
    private readonly messages: GroupMessagesService,
    private readonly photos: GroupPhotosService,
    private readonly alerts: GroupAlertsService,
  ) {}

  @Get("messages")
  @ApiRoute({
    summary:
      "One page of the thread (before / after) plus what changed since changedSince, the group and what I may do",
    response: groupThreadResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async thread(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Query({ schema: groupThreadQuerySchema }) query: GroupThreadQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set("Cache-Control", "no-store");
    return this.messages.thread(actor, groupId, query);
  }

  @Post("messages")
  @RefuseRestricted()
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description:
      "8-64 characters (a UUID fits). A retry by the same sender answers with the first message and creates nothing.",
  })
  @ApiRoute({
    summary:
      "Send text, a sticker, up to 10 photos with a caption, or a reply (Idempotency-Key)",
    body: groupSendMessageRequestSchema,
    response: groupMessageResponseSchema,
    status: 201,
    also: [{ status: 200, description: "A retry: the stored message" }],
    errors: [400, 401, 403, 404],
  })
  async send(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Body({ schema: groupSendMessageRequestSchema })
    body: GroupSendMessageRequest,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.messages.send(
      actor,
      groupId,
      body,
      parseIdempotencyKey(key, body.clientId, true)!,
    );

    res.status(result.created ? 201 : 200);
    return { message: result.message };
  }

  @Patch("messages/:mid")
  @RefuseRestricted()
  @ApiRoute({
    summary: "Edit my own message (the previous text is kept in the history)",
    body: groupEditMessageRequestSchema,
    response: groupMessageResponseSchema,
    errors: [400, 401, 403, 404, 409],
  })
  async edit(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Param("mid", idParam) mid: number,
    @Body({ schema: groupEditMessageRequestSchema })
    body: GroupEditMessageRequest,
  ) {
    return {
      message: await this.messages.edit(actor, groupId, mid, body.body),
    };
  }

  @Delete("messages/:mid")
  @ApiRoute({
    summary: "Unsend my own message for everyone (idempotent)",
    response: groupMessageResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async unsend(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Param("mid", idParam) mid: number,
  ) {
    return { message: await this.messages.unsend(actor, groupId, mid) };
  }

  @Put("messages/:mid/reaction")
  @RefuseRestricted()
  @ApiRoute({
    summary: "React (one per person; another emoji replaces it)",
    body: groupReactRequestSchema,
    response: groupMessageResponseSchema,
    errors: [400, 401, 403, 404, 409],
  })
  async react(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Param("mid", idParam) mid: number,
    @Body({ schema: groupReactRequestSchema }) body: GroupReactRequest,
  ) {
    return {
      message: await this.messages.react(actor, groupId, mid, body.emoji),
    };
  }

  @Delete("messages/:mid/reaction")
  @RefuseRestricted()
  @ApiRoute({
    summary: "Remove my reaction",
    response: groupMessageResponseSchema,
    errors: [400, 401, 403, 404, 409],
  })
  async unreact(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Param("mid", idParam) mid: number,
  ) {
    return { message: await this.messages.react(actor, groupId, mid, null) };
  }

  @Put("messages/:mid/hidden")
  @Admin()
  @ApiRoute({
    summary:
      "Hide or unhide anyone's message (super admin or the creator PT); the text stays stored",
    body: groupHideRequestSchema,
    response: groupMessageResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async hide(
    @Actor() actor: AdminActor,
    @Param("groupId", idParam) groupId: number,
    @Param("mid", idParam) mid: number,
    @Body({ schema: groupHideRequestSchema }) body: GroupHideRequest,
  ) {
    return {
      message: await this.messages.hide(actor, groupId, mid, body.hidden),
    };
  }

  @Get("messages/:mid/edits")
  @ApiRoute({
    summary: "Previous texts of a message; empty once unsent or hidden",
    response: groupEditsResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async edits(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Param("mid", idParam) mid: number,
  ) {
    return { edits: await this.messages.edits(actor, groupId, mid) };
  }

  @Get("messages/:mid/seen")
  @ApiRoute({
    summary: "Who read up to a message (never its sender)",
    response: groupSeenByResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async seen(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Param("mid", idParam) mid: number,
  ) {
    return { seenBy: await this.messages.seenBy(actor, groupId, mid) };
  }

  @Post("messages/:mid/alert")
  @Roles("super_admin")
  @HttpCode(204)
  @ApiRoute({
    summary:
      "Resolve a PT-change alert once: keep, or remove the trainee from the group (409 GROUP_ALERT_HANDLED with details.handledBy)",
    body: groupResolveAlertRequestSchema,
    status: 204,
    errors: [400, 401, 403, 404, 409],
  })
  async resolveAlert(
    @Actor() actor: AdminActor,
    @Param("groupId", idParam) groupId: number,
    @Param("mid", idParam) mid: number,
    @Body({ schema: groupResolveAlertRequestSchema })
    body: GroupResolveAlertRequest,
  ): Promise<void> {
    await this.alerts.resolve(actor, groupId, mid, body.choice);
  }

  @Post("read")
  @HttpCode(200)
  @ApiRoute({
    summary:
      "Move my read cursor forward (never past the newest message); allowed while chat is off or restricted",
    body: groupMarkReadRequestSchema,
    response: groupReadResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async read(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Body({ schema: groupMarkReadRequestSchema }) body: GroupMarkReadRequest,
  ) {
    return {
      lastReadMessageId: await this.messages.markRead(
        actor,
        groupId,
        body.lastReadMessageId,
      ),
    };
  }

  // --- Photos ---------------------------------------------------------------

  @Post("photos")
  @RefuseRestricted()
  @ApiRoute({
    summary:
      "Upload a photo (raw image bytes, JPEG/PNG/WebP, 1.5 MB, 1600 px); it stays pending until a message carries it. Same rules as sending",
    response: groupPhotoResponseSchema,
    status: 201,
    errors: [400, 401, 403, 404, 413],
  })
  async upload(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Req() request: Request,
  ) {
    return {
      photo: {
        id: await this.photos.upload(actor, groupId, bytesOf(request)),
      },
    };
  }

  // 404 for anyone who is not a member of that group (never 403). The bytes
  // of an id never change, so a private cache may keep them.
  @Get("photos/:photoId")
  @ApiRoute({
    summary: "The bytes of a photo of a message in this group",
    also: [{ status: 200, description: "image/webp, image/jpeg or image/png" }],
    errors: [400, 401, 404],
  })
  async photo(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Param("photoId", idParam) photoId: number,
    @Res() res: Response,
  ) {
    const file = await this.photos.serve(actor, groupId, photoId);

    res
      .status(200)
      .set({
        "Content-Type": file.mime,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      })
      .send(file.bytes);
  }
}
