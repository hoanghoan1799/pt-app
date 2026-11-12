import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  type ChatConversationColorRequest,
  chatConversationColorRequestSchema,
  chatConversationResponseSchema,
  chatEnabledResponseSchema,
  type ChatGalleryQuery,
  chatGalleryQuerySchema,
  chatGalleryResponseSchema,
  type ChatMarkReadRequest,
  chatMarkReadRequestSchema,
  chatMessageResponseSchema,
  chatProfileResponseSchema,
  chatReadResponseSchema,
  type ChatSearchQuery,
  chatSearchQuerySchema,
  chatSearchResponseSchema,
  type ChatSendMessageRequest,
  chatSendMessageRequestSchema,
  type ChatSetEnabledRequest,
  chatSetEnabledRequestSchema,
  type ChatThreadQuery,
  chatThreadQuerySchema,
  chatThreadResponseSchema,
  idParamSchema,
} from "@pt/contracts";
import type { Response } from "express";

import type { AdminActor, AuthActor, UserActor } from "../auth/actor.js";
import { Actor, Admin, User } from "../auth/decorators/index.js";
import { ApiRoute } from "../common/openapi/api-route.js";
import { ChatAccess } from "./chat.access.js";
import { ChatService } from "./chat.service.js";
import { ChatGalleryService } from "./chat-gallery.service.js";
import { ChatInboxService } from "./chat-inbox.service.js";
import { ChatProfileService } from "./chat-profile.service.js";
import { ChatSearchService } from "./chat-search.service.js";
import { ChatThreadService } from "./chat-thread.service.js";
import { IDEMPOTENCY_HEADER, parseIdempotencyKey } from "./idempotency.js";

const idParam = { schema: idParamSchema };
const keyHeader = ApiHeader({
  name: "Idempotency-Key",
  required: true,
  description:
    "8-64 characters (a UUID fits). A retry with the same key answers with the first message and creates nothing.",
});

// The conversation endpoints. A trainee uses the `me` alias (the conversation
// always comes from the session); a PT names the conversation, or the trainee
// when the conversation may not exist yet. Every access decision goes through
// the ChatPolicy (ChatAccess): out of workspace, hidden without a reveal and
// missing all answer 404. Writes need chat switched on for the trainee.
// `me` routes come first so "me" is never read as an id.
@ApiTags("chat")
@Controller("chat")
export class ChatConversationsController {
  constructor(
    private readonly access: ChatAccess,
    private readonly threads: ChatThreadService,
    private readonly chat: ChatService,
    private readonly search: ChatSearchService,
    private readonly gallery: ChatGalleryService,
    private readonly profiles: ChatProfileService,
    private readonly inbox: ChatInboxService,
  ) {}

  // --- Trainee: my own conversation ----------------------------------------

  @Get("conversations/me/messages")
  @User()
  @ApiRoute({
    summary:
      "Poll my thread (cursor, changedSince); 204 when nothing changed since after/readUpTo/enabled/changedSince",
    response: chatThreadResponseSchema,
    also: [{ status: 204, description: "Nothing changed" }],
    errors: [400, 401, 403],
  })
  async myThread(
    @Actor() actor: UserActor,
    @Query({ schema: chatThreadQuerySchema }) query: ChatThreadQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.threads.load(await this.access.own(actor), query);

    res.set("Cache-Control", "no-store");
    if (result.notModified) {
      res.status(204);
      return;
    }
    return result.payload;
  }

  @Post("conversations/me/messages")
  @User()
  @keyHeader
  @ApiRoute({
    summary: "Send text, a sticker or a photo (Idempotency-Key)",
    body: chatSendMessageRequestSchema,
    response: chatMessageResponseSchema,
    status: 201,
    also: [{ status: 200, description: "A retry: the stored message" }],
    errors: [400, 401, 403, 404, 409],
  })
  async mySend(
    @Actor() actor: UserActor,
    @Body({ schema: chatSendMessageRequestSchema })
    body: ChatSendMessageRequest,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.send(await this.access.own(actor), body, key, res);
  }

  @Get("conversations/me/search")
  @User()
  @ApiRoute({
    summary: "Accent-insensitive search in my conversation, newest first",
    response: chatSearchResponseSchema,
  })
  async mySearch(
    @Actor() actor: UserActor,
    @Query({ schema: chatSearchQuerySchema }) query: ChatSearchQuery,
  ) {
    const { conversation } = await this.access.own(actor);

    return conversation
      ? this.search.search(conversation.id, query.q, query.before)
      : { results: [], nextCursor: null };
  }

  @Get("conversations/me/gallery")
  @User()
  @ApiRoute({
    summary: "Photos, stickers or links of my conversation (tab, before)",
    response: chatGalleryResponseSchema,
  })
  async myGallery(
    @Actor() actor: UserActor,
    @Query({ schema: chatGalleryQuerySchema }) query: ChatGalleryQuery,
  ) {
    const { conversation } = await this.access.own(actor);

    return conversation
      ? this.gallery.list(query.tab ?? "photos", conversation.id, query.before)
      : { items: [], nextCursor: null };
  }

  @Post("conversations/me/read")
  @User()
  @HttpCode(200)
  @ApiRoute({
    summary: "Mark my conversation read up to a message (never backwards)",
    body: chatMarkReadRequestSchema,
    response: chatReadResponseSchema,
  })
  async myRead(
    @Actor() actor: UserActor,
    @Body({ schema: chatMarkReadRequestSchema }) body: ChatMarkReadRequest,
  ) {
    return {
      lastReadMessageId: await this.chat.markRead(
        await this.access.own(actor),
        body.lastReadMessageId,
      ),
    };
  }

  // --- PT: a conversation by id --------------------------------------------

  @Get("conversations/:cid")
  @Admin()
  @ApiRoute({
    summary:
      "Header of a conversation: trainee, chat switch, colours, nicknames",
    response: chatConversationResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async header(@Actor() actor: AdminActor, @Param("cid", idParam) cid: number) {
    const context = await this.access.forConversation(actor, cid);

    return this.inbox.header(actor, context.trainee, cid);
  }

  @Get("conversations/:cid/messages")
  @Admin()
  @ApiRoute({
    summary: "Read a trainee's thread (cursor, changedSince, around)",
    response: chatThreadResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async thread(
    @Actor() actor: AdminActor,
    @Param("cid", idParam) cid: number,
    @Query({ schema: chatThreadQuerySchema }) query: ChatThreadQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.threads.load(
      await this.access.forConversation(actor, cid),
      query,
    );

    res.set("Cache-Control", "no-store");
    return result.notModified ? undefined : result.payload;
  }

  @Get("conversations/:cid/search")
  @Admin()
  @ApiRoute({
    summary: "Accent-insensitive search in a conversation",
    response: chatSearchResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async searchOf(
    @Actor() actor: AdminActor,
    @Param("cid", idParam) cid: number,
    @Query({ schema: chatSearchQuerySchema }) query: ChatSearchQuery,
  ) {
    await this.access.forConversation(actor, cid);
    return this.search.search(cid, query.q, query.before);
  }

  @Get("conversations/:cid/gallery")
  @Admin()
  @ApiRoute({
    summary: "Photos, stickers or links of a conversation (tab, before)",
    response: chatGalleryResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async galleryOf(
    @Actor() actor: AdminActor,
    @Param("cid", idParam) cid: number,
    @Query({ schema: chatGalleryQuerySchema }) query: ChatGalleryQuery,
  ) {
    await this.access.forConversation(actor, cid);
    return this.gallery.list(query.tab ?? "photos", cid, query.before);
  }

  @Post("conversations/:cid/read")
  @Admin()
  @HttpCode(200)
  @ApiRoute({
    summary: "Mark a conversation read for me (per admin)",
    body: chatMarkReadRequestSchema,
    response: chatReadResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async read(
    @Actor() actor: AdminActor,
    @Param("cid", idParam) cid: number,
    @Body({ schema: chatMarkReadRequestSchema }) body: ChatMarkReadRequest,
  ) {
    return {
      lastReadMessageId: await this.chat.markRead(
        await this.access.forConversation(actor, cid),
        body.lastReadMessageId,
      ),
    };
  }

  @Put("conversations/:cid/color")
  @Admin()
  @ApiRoute({
    summary: "My bubble colour in this conversation only (null removes it)",
    body: chatConversationColorRequestSchema,
    response: chatProfileResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async color(
    @Actor() actor: AdminActor,
    @Param("cid", idParam) cid: number,
    @Body({ schema: chatConversationColorRequestSchema })
    body: ChatConversationColorRequest,
  ) {
    const context = await this.access.forConversation(actor, cid);

    return {
      profile: await this.profiles.setConversationColor(context, body.color),
    };
  }

  // --- PT: by trainee (the conversation may not exist yet) -----------------

  @Get("trainees/:userId/conversation")
  @Admin()
  @ApiRoute({
    summary:
      "Header of a trainee's chat; conversationId is null before the first message",
    response: chatConversationResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async traineeHeader(
    @Actor() actor: AdminActor,
    @Param("userId", idParam) userId: number,
  ) {
    const context = await this.access.forTraineeId(actor, userId);

    return this.inbox.header(
      actor,
      context.trainee,
      context.conversation?.id ?? null,
    );
  }

  @Post("trainees/:userId/messages")
  @Admin()
  @keyHeader
  @ApiRoute({
    summary:
      "Send to a trainee as a PT; the conversation is created on first send",
    body: chatSendMessageRequestSchema,
    response: chatMessageResponseSchema,
    status: 201,
    also: [{ status: 200, description: "A retry: the stored message" }],
    errors: [400, 401, 403, 404, 409],
  })
  async traineeSend(
    @Actor() actor: AdminActor,
    @Param("userId", idParam) userId: number,
    @Body({ schema: chatSendMessageRequestSchema })
    body: ChatSendMessageRequest,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.send(
      await this.access.forTraineeId(actor, userId),
      body,
      key,
      res,
    );
  }

  @Put("trainees/:userId/enabled")
  @Admin()
  @ApiRoute({
    summary: "Switch chat on or off for one trainee (S1)",
    body: chatSetEnabledRequestSchema,
    response: chatEnabledResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async setEnabled(
    @Actor() actor: AdminActor,
    @Param("userId", idParam) userId: number,
    @Body({ schema: chatSetEnabledRequestSchema }) body: ChatSetEnabledRequest,
  ) {
    return {
      enabled: await this.chat.setEnabled(
        await this.access.forTraineeId(actor, userId),
        body.enabled,
      ),
    };
  }

  private async send(
    context: Awaited<ReturnType<ChatAccess["own"]>>,
    body: ChatSendMessageRequest,
    header: string | undefined,
    res: Response,
  ) {
    const key = parseIdempotencyKey(header, body.clientId, true);
    const result = await this.chat.send(context, body, key as string);

    // A retry answers 200 with the stored message; a new message is 201.
    res.status(result.created ? 201 : 200);
    return { message: result.message };
  }
}

export type { AuthActor };
