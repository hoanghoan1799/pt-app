import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  chatReadResponseSchema,
  dmAdminListResponseSchema,
  dmInboxResponseSchema,
  type DmOpenRequest,
  dmOpenRequestSchema,
  dmOpenResponseSchema,
  type DmSendRequest,
  dmSendRequestSchema,
  type DmThreadQuery,
  dmThreadQuerySchema,
  dmThreadResponseSchema,
  idParamSchema,
} from "@pt/contracts";
import type { Response } from "express";

import type { AdminActor, AuthActor, UserActor } from "../auth/actor.js";
import { Actor, Roles, User } from "../auth/decorators/index.js";
import { ApiRoute } from "../common/openapi/api-route.js";
import { DmQueries } from "./dm.queries.js";
import { DmService } from "./dm.service.js";

const idParam = { schema: idParamSchema };

// Trainee-to-trainee chat, read-only since 2026-11-09: the list, the threads
// and the photos of old conversations. Sending is refused (403 DM_DISABLED);
// a member can still unsend their own old messages and mark a thread read. A
// trainee sees only their own conversations; a super admin reads all of them;
// everyone else (a PT, a stranger, a blocked pair) gets 404 so ids reveal
// nothing.
@ApiTags("dm")
@Controller()
export class DmController {
  constructor(
    private readonly dm: DmService,
    private readonly queries: DmQueries,
  ) {}

  @Get("dm/conversations")
  @User()
  @ApiRoute({
    summary:
      "My trainee conversations with a message, newest first, unread counts",
    response: dmInboxResponseSchema,
  })
  async inbox(@Actor() actor: UserActor) {
    await this.dm.requireTerms(actor);
    return { conversations: await this.queries.inbox(actor.id, actor.locale) };
  }

  @Post("dm/conversations")
  @User()
  @HttpCode(200)
  @ApiRoute({
    summary:
      "Open an existing conversation with another trainee; new ones are never created (403 DM_DISABLED)",
    body: dmOpenRequestSchema,
    response: dmOpenResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async open(
    @Actor() actor: UserActor,
    @Body({ schema: dmOpenRequestSchema }) body: DmOpenRequest,
  ) {
    return { conversationId: await this.dm.open(actor, body.otherId) };
  }

  @Get("dm/conversations/:cid/messages")
  @ApiRoute({
    summary:
      "Thread of a conversation (after / before ids), isReadOnly always true for members",
    response: dmThreadResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async thread(
    @Actor() actor: AuthActor,
    @Param("cid", idParam) cid: number,
    @Query({ schema: dmThreadQuerySchema }) query: DmThreadQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set("Cache-Control", "no-store");
    return this.dm.thread(actor, cid, query);
  }

  @Post("dm/conversations/:cid/messages")
  @User()
  @ApiRoute({
    summary: "Sending is switched off: always 403 DM_DISABLED for a member",
    body: dmSendRequestSchema,
    errors: [400, 401, 403, 404],
  })
  send(
    @Actor() actor: UserActor,
    @Param("cid", idParam) cid: number,
    // Validated (400 before 403) but never used: nothing is ever sent.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Body({ schema: dmSendRequestSchema }) _body: DmSendRequest,
  ) {
    return this.dm.send(actor, cid);
  }

  @Post("dm/conversations/:cid/read")
  @User()
  @HttpCode(200)
  @ApiRoute({
    summary: "Mark a conversation read for me",
    response: chatReadResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async read(@Actor() actor: UserActor, @Param("cid", idParam) cid: number) {
    return { lastReadMessageId: await this.dm.markRead(actor, cid) };
  }

  @Delete("dm/messages/:mid")
  @User()
  @HttpCode(204)
  @ApiRoute({
    summary: "Take back my own old message (the photo bytes go too)",
    errors: [400, 401, 403, 404],
  })
  async unsend(@Actor() actor: UserActor, @Param("mid", idParam) mid: number) {
    await this.dm.unsend(actor, mid);
  }

  // 404 unless the viewer is one of the two members (and the chat is not
  // hidden by a block) or a super admin; never 403. A PT never gets it.
  @Get("dm/photos/:id")
  @ApiRoute({
    summary: "The photo bytes of a trainee chat message",
    also: [{ status: 200, description: "image/webp, image/jpeg or image/png" }],
    errors: [400, 401, 404],
  })
  async photo(
    @Actor() actor: AuthActor,
    @Param("id", idParam) id: number,
    @Res() res: Response,
  ) {
    const file = await this.dm.photo(actor, id);

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

  @Get("admin/dm/conversations")
  @Roles("super_admin")
  @ApiRoute({
    summary: "Every trainee conversation, read-only, for the super admin",
    response: dmAdminListResponseSchema,
    errors: [401, 403],
  })
  async adminList(@Actor() actor: AdminActor) {
    return { conversations: await this.queries.adminList(actor.locale) };
  }
}
