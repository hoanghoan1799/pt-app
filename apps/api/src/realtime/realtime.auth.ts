import { Inject, Injectable } from "@nestjs/common";
import type { RealtimeRejection } from "@pt/contracts";

import type { AuthActor } from "../auth/actor.js";
import { isExpired } from "../auth/session-rules.js";
import { isWellFormedToken } from "../auth/session-token.js";
import { SessionsService } from "../auth/sessions.service.js";
import { Clock } from "../common/clock.js";
import { APP_ENV } from "../config/app-config.module.js";
import type { Env } from "../config/env.schema.js";
import { TicketStore } from "./ticket.store.js";

export type HandshakeResult =
  { ok: true; actor: AuthActor } | { ok: false; code: RealtimeRejection };

const normalize = (origin: string) => origin.replace(/\/+$/, "").toLowerCase();

// A browser always sends Origin; it must be the web app. Mobile apps and
// server-side clients send none and rely on the token alone.
export const isOriginAllowed = (origin: string | undefined, allowed: string) =>
  origin === undefined || normalize(origin) === normalize(allowed);

// The Socket.IO handshake: who is connecting. `auth.ticket` (browser, from
// POST /v1/realtime/ticket, single use) or `auth.token` (mobile, the opaque
// session token). Both end in the same live actor as a REST request.
@Injectable()
export class RealtimeAuth {
  constructor(
    private readonly tickets: TicketStore,
    private readonly sessions: SessionsService,
    private readonly clock: Clock,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  async handshake(
    origin: string | undefined,
    auth: unknown,
  ): Promise<HandshakeResult> {
    if (!isOriginAllowed(origin, this.env.WEB_ORIGIN)) {
      return { ok: false, code: "origin_not_allowed" };
    }
    const fields =
      typeof auth === "object" && auth !== null
        ? (auth as Record<string, unknown>)
        : {};
    let actor: AuthActor | null = null;

    if (typeof fields.ticket === "string") {
      const sessionId = this.tickets.consume(fields.ticket);

      if (sessionId === null) {
        return { ok: false, code: "ticket_invalid" };
      }
      actor = await this.sessions.loadActor(sessionId);
      if (!actor || isExpired(actor.session.expiresAt, this.clock.now())) {
        return { ok: false, code: "session_expired" };
      }
    } else if (
      typeof fields.token === "string" &&
      isWellFormedToken(fields.token)
    ) {
      actor = await this.sessions.authenticate(fields.token);
      if (!actor) {
        return { ok: false, code: "unauthorized" };
      }
    } else {
      return { ok: false, code: "unauthorized" };
    }
    // The web hides chat from a passcode-locked admin.
    if (actor.kind === "admin" && actor.locked) {
      return { ok: false, code: "admin_locked" };
    }
    return { ok: true, actor };
  }
}
