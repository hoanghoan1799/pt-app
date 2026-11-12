import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  idParamSchema,
  REALTIME_NAMESPACE,
  REALTIME_TICKET_TTL_SECONDS,
  type RealtimePresencePeerQuery,
  realtimePresencePeerQuerySchema,
  realtimePresencePeerResponseSchema,
  realtimeTicketResponseSchema,
} from "@pt/contracts";

import type { AdminActor, AuthActor, UserActor } from "../auth/actor.js";
import { Actor, Admin, User } from "../auth/decorators/index.js";
import { ApiRoute } from "../common/openapi/api-route.js";
import { PresenceService } from "./presence.service.js";
import { TicketStore } from "./ticket.store.js";
import { TypingService } from "./typing.service.js";

const idParam = { schema: idParamSchema };

// The browser's way into the socket, the presence heartbeat and the REST
// fallbacks of the socket events (for clients without a live connection).
@ApiTags("realtime")
@Controller()
export class RealtimeController {
  constructor(
    private readonly tickets: TicketStore,
    private readonly presence: PresenceService,
    private readonly typing: TypingService,
  ) {}

  // The ticket names the caller's session. It works once, for 60 seconds, so
  // the long-lived token never reaches page JavaScript. Mobile clients skip
  // this and connect with `auth: { token }`.
  @Post(["realtime/ticket", "realtime/tickets"])
  @HttpCode(200)
  @ApiRoute({
    summary: "One-time ticket (60 s) for the Socket.IO handshake `auth.ticket`",
    response: realtimeTicketResponseSchema,
    errors: [401, 403],
  })
  ticket(@Actor() actor: AuthActor) {
    return {
      ticket: this.tickets.issue(actor.session.id),
      expiresInSeconds: REALTIME_TICKET_TTL_SECONDS,
      namespace: REALTIME_NAMESPACE,
    };
  }

  // Tells the server this person has the app open: once a minute while the
  // page is visible. Also slides the unlock window of an unlocked admin.
  @Post("presence/heartbeat")
  @HttpCode(204)
  @ApiRoute({
    summary: "Presence heartbeat (also extends an admin's unlock window)",
    status: 204,
    errors: [401, 403],
  })
  async heartbeat(@Actor() actor: AuthActor) {
    await this.presence.heartbeat(actor);
  }

  @Get("presence/peer")
  @ApiRoute({
    summary:
      "The other side's last seen: the PT team for a trainee, `?userId=` for an admin",
    response: realtimePresencePeerResponseSchema,
    errors: [400, 401, 403, 404],
  })
  peer(
    @Actor() actor: AuthActor,
    @Query({ schema: realtimePresencePeerQuerySchema })
    query: RealtimePresencePeerQuery,
  ) {
    return this.presence.peer(actor, query.userId);
  }

  // Typing, for clients without a socket. 204 also when the rate limit
  // dropped it; a locked chat answers 403.
  @Post("chat/conversations/me/typing")
  @User()
  @HttpCode(204)
  @ApiRoute({
    summary: "Relay a typing indicator in my conversation",
    status: 204,
    errors: [401, 403, 404],
  })
  async myTyping(@Actor() actor: UserActor) {
    await this.typing.relay(actor, undefined, `rest:user:${actor.id}`);
  }

  @Post("chat/conversations/:cid/typing")
  @Admin()
  @HttpCode(204)
  @ApiRoute({
    summary: "Relay a typing indicator in a conversation I may write in",
    status: 204,
    errors: [400, 401, 403, 404],
  })
  async typingIn(
    @Actor() actor: AdminActor,
    @Param("cid", idParam) cid: number,
  ) {
    await this.typing.relay(actor, cid, `rest:admin:${actor.id}`);
  }
}
