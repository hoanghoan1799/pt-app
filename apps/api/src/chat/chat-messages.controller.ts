import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
  type ChatBubblesQuery,
  chatBubblesQuerySchema,
  chatBubblesResponseSchema,
  type ChatEditMessageRequest,
  chatEditMessageRequestSchema,
  chatEditsResponseSchema,
  type ChatInboxQuery,
  chatInboxQuerySchema,
  chatInboxResponseSchema,
  chatMessageResponseSchema,
  chatPhotoResponseSchema,
  type ChatReactRequest,
  chatReactRequestSchema,
  chatUnreadResponseSchema,
  idParamSchema,
} from "@pt/contracts";
import type { Request, Response } from "express";

import type { AdminActor, AuthActor, UserActor } from "../auth/actor.js";
import { Actor, Admin, User } from "../auth/decorators/index.js";
import { ApiRoute } from "../common/openapi/api-route.js";
import { ChatAccess } from "./chat.access.js";
import { chatErrors } from "./chat.errors.js";
import { ChatService } from "./chat.service.js";
import { ChatInboxService } from "./chat-inbox.service.js";
import { ChatPhotosService } from "./chat-photos.service.js";
import { ChatThreadService } from "./chat-thread.service.js";
import { IDEMPOTENCY_HEADER, parseIdempotencyKey } from "./idempotency.js";

const idParam = { schema: idParamSchema };

// The raw image bytes of an upload (the browser has already resized and
// re-encoded them); the type is read from the bytes, never from the header.
const bytesOf = (request: Request) => {
  const body: unknown = request.body;

  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw chatErrors.badImage();
  }
  return body;
};

// Message-level endpoints (edit, unsend, react, history), photos, the inbox
// and the badges. The caller's access to the message's conversation is decided
// by the ChatPolicy; a message of a conversation they cannot read is "not
// found", never "not yours".
@ApiTags("chat")
@Controller("chat")
export class ChatMessagesController {
  constructor(
    private readonly access: ChatAccess,
    private readonly chat: ChatService,
    private readonly threads: ChatThreadService,
    private readonly photos: ChatPhotosService,
    private readonly inbox: ChatInboxService,
  ) {}

  @Patch("messages/:mid")
  @ApiRoute({
    summary: "Edit my own message (the previous text is kept in the history)",
    body: chatEditMessageRequestSchema,
    response: chatMessageResponseSchema,
    errors: [400, 401, 403, 404, 409],
  })
  async edit(
    @Actor() actor: AuthActor,
    @Param("mid", idParam) mid: number,
    @Body({ schema: chatEditMessageRequestSchema })
    body: ChatEditMessageRequest,
  ) {
    return { message: await this.chat.edit(actor, mid, body.body) };
  }

  @Delete("messages/:mid")
  @ApiRoute({
    summary: "Unsend my own message for everyone (idempotent)",
    response: chatMessageResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async unsend(@Actor() actor: AuthActor, @Param("mid", idParam) mid: number) {
    return { message: await this.chat.unsend(actor, mid) };
  }

  @Put("messages/:mid/reaction")
  @ApiRoute({
    summary: "React to a message (one per person; another emoji replaces it)",
    body: chatReactRequestSchema,
    response: chatMessageResponseSchema,
    errors: [400, 401, 403, 404, 409],
  })
  async react(
    @Actor() actor: AuthActor,
    @Param("mid", idParam) mid: number,
    @Body({ schema: chatReactRequestSchema }) body: ChatReactRequest,
  ) {
    return { message: await this.chat.react(actor, mid, body.emoji) };
  }

  @Delete("messages/:mid/reaction")
  @ApiRoute({
    summary: "Remove my reaction",
    response: chatMessageResponseSchema,
    errors: [400, 401, 403, 404, 409],
  })
  async unreact(@Actor() actor: AuthActor, @Param("mid", idParam) mid: number) {
    return { message: await this.chat.react(actor, mid, null) };
  }

  @Get("messages/:mid/edits")
  @ApiRoute({
    summary:
      "Previous texts of a message (both sides see them); empty once unsent",
    response: chatEditsResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async edits(@Actor() actor: AuthActor, @Param("mid", idParam) mid: number) {
    const { stored } = await this.access.forMessage(actor, mid);

    return { edits: await this.threads.edits(mid, stored.deletedAt !== null) };
  }

  // --- Photos ---------------------------------------------------------------

  @Post("photos")
  @User()
  @ApiHeader({ name: "Idempotency-Key", required: false })
  @ApiRoute({
    summary:
      "Upload a photo (raw image bytes, JPEG/PNG/WebP, 1.5 MB, 1600 px); it stays pending until a message carries it",
    response: chatPhotoResponseSchema,
    status: 201,
    also: [{ status: 200, description: "A retry: the first upload's id" }],
    errors: [400, 401, 403, 413],
  })
  async upload(
    @Actor() actor: UserActor,
    @Req() request: Request,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.store(await this.access.own(actor), request, key, res);
  }

  @Post("trainees/:userId/photos")
  @Admin()
  @ApiHeader({ name: "Idempotency-Key", required: false })
  @ApiRoute({
    summary: "Upload a photo into a trainee's conversation as a PT",
    response: chatPhotoResponseSchema,
    status: 201,
    also: [{ status: 200, description: "A retry: the first upload's id" }],
    errors: [400, 401, 403, 404, 413],
  })
  async uploadFor(
    @Actor() actor: AdminActor,
    @Param("userId", idParam) userId: number,
    @Req() request: Request,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.store(
      await this.access.forTraineeId(actor, userId),
      request,
      key,
      res,
    );
  }

  // 404 for anyone who is not the trainee of its conversation or an admin who
  // can access that trainee (never 403, so ids reveal nothing). The bytes of
  // an id never change, so a private cache may keep them.
  @Get("photos/:id")
  @ApiRoute({
    summary: "The photo bytes",
    also: [{ status: 200, description: "image/webp, image/jpeg or image/png" }],
    errors: [400, 401, 404],
  })
  async photo(
    @Actor() actor: AuthActor,
    @Param("id", idParam) id: number,
    @Res() res: Response,
  ) {
    const file = await this.photos.serve(actor, id);

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

  // --- Inbox and badges -----------------------------------------------------

  @Get("inbox")
  @Admin()
  @ApiRoute({
    summary:
      "Conversations of my trainees, newest first, with unread counts; hidden=1 lists my hidden trainees (revealed sessions only)",
    response: chatInboxResponseSchema,
  })
  inboxOf(
    @Actor() actor: AdminActor,
    @Query({ schema: chatInboxQuerySchema }) query: ChatInboxQuery,
  ) {
    return this.inbox.inbox(actor, query.hidden === true);
  }

  @Get("unread")
  @ApiRoute({
    summary:
      "Badge poll. Trainee: { count, coachCount, dmCount, chatEnabled, hasHistory, latestLoudIncomingId }. Admin: { count, perTrainee }",
    response: chatUnreadResponseSchema,
    errors: [401, 403],
  })
  async unread(
    @Actor() actor: AuthActor,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set("Cache-Control", "no-store");
    return actor.kind === "user"
      ? this.inbox.unreadForTrainee(actor)
      : this.inbox.unreadForAdmin(actor);
  }

  @Get("bubbles")
  @ApiRoute({
    summary:
      "Name, photo and presence of the chats kept as bubbles. Trainee: the coach chat. Admin: ?ids=1,2 (unknown, hidden and out-of-workspace ids are missing)",
    response: chatBubblesResponseSchema,
    errors: [400, 401, 403],
  })
  async bubbles(
    @Actor() actor: AuthActor,
    @Query({ schema: chatBubblesQuerySchema }) query: ChatBubblesQuery,
  ) {
    return {
      bubbles:
        actor.kind === "user"
          ? await this.inbox.bubblesForTrainee(actor)
          : await this.inbox.bubblesForAdmin(actor, parseIdList(query.ids, 20)),
    };
  }

  private async store(
    context: Awaited<ReturnType<ChatAccess["own"]>>,
    request: Request,
    header: string | undefined,
    res: Response,
  ) {
    const result = await this.photos.upload(
      context,
      bytesOf(request),
      parseIdempotencyKey(header),
    );

    res.status(result.created ? 201 : 200);
    return { photo: { id: result.id } };
  }
}

// `?ids=1,2`: plain positive ids, deduped, at most `max`.
export const parseIdList = (raw: string | undefined, max: number) => {
  const ids = (raw ?? "")
    .split(",")
    .filter((part) => /^[1-9]\d{0,14}$/.test(part))
    .map(Number);

  return [...new Set(ids)].slice(0, max);
};
