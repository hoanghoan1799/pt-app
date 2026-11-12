import { Injectable } from "@nestjs/common";
import { REALTIME_TICKET_TTL_SECONDS } from "@pt/contracts";

import { generateToken, hashToken } from "../auth/session-token.js";
import { Clock } from "../common/clock.js";

// Single-use handshake tickets for browsers, so the long-lived session token
// never reaches page JavaScript. Only the SHA-256 of a ticket is kept (a
// memory dump or log never holds a usable ticket), and it names the session,
// never the token. One instance keeps them in memory; with a second instance
// (Redis adapter) this moves to the shared store with the same interface.

const MAX_PENDING = 10_000;

type Pending = { sessionId: string; expiresAt: number };

@Injectable()
export class TicketStore {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly clock: Clock) {}

  issue(sessionId: string) {
    const now = this.clock.now().getTime();

    this.purge(now);
    if (this.pending.size >= MAX_PENDING) {
      // Refuse to grow without bound; the oldest ticket (60 s) goes first.
      const oldest = this.pending.keys().next().value;

      if (oldest !== undefined) {
        this.pending.delete(oldest);
      }
    }
    const ticket = generateToken();

    this.pending.set(hashToken(ticket).toString("hex"), {
      sessionId,
      expiresAt: now + REALTIME_TICKET_TTL_SECONDS * 1000,
    });
    return ticket;
  }

  // The session of a valid ticket, which stops working at once. A reused,
  // expired or unknown ticket is null.
  consume(ticket: string): string | null {
    const key = hashToken(ticket).toString("hex");
    const found = this.pending.get(key);

    if (!found) {
      return null;
    }
    this.pending.delete(key);
    return found.expiresAt > this.clock.now().getTime()
      ? found.sessionId
      : null;
  }

  get size() {
    return this.pending.size;
  }

  private purge(now: number) {
    for (const [key, value] of this.pending) {
      if (value.expiresAt <= now) {
        this.pending.delete(key);
      }
    }
  }
}
