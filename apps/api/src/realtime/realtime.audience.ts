import { Injectable } from "@nestjs/common";

import type { AuthActor } from "../auth/actor.js";
import { isExpired } from "../auth/session-rules.js";
import { SessionsService } from "../auth/sessions.service.js";
import { ChatPolicy, type ConversationFacts } from "../chat/chat.policy.js";
import { ChatQueries } from "../chat/chat.queries.js";
import { Clock } from "../common/clock.js";

// Who may follow a conversation's events: the ChatPolicy that guards the REST
// reads, applied to a live socket. A trainee follows only their own
// conversation; a PT only those of their trainees; a super admin all; a hidden
// trainee stays out of reach unless the session revealed them; a locked admin
// follows nothing.
@Injectable()
export class RealtimeAudience {
  constructor(
    private readonly policy: ChatPolicy,
    private readonly queries: ChatQueries,
    private readonly sessions: SessionsService,
    private readonly clock: Clock,
  ) {}

  // Pure part, unit-tested on its own.
  mayFollow(actor: AuthActor, facts: ConversationFacts | null) {
    return facts !== null && this.policy.canRead(actor, facts);
  }

  async mayFollowTrainee(actor: AuthActor, traineeUserId: number) {
    if (actor.kind === "user") {
      return actor.id === traineeUserId;
    }
    return this.mayFollow(
      actor,
      await this.queries.findTraineeFacts(traineeUserId, actor.id),
    );
  }

  // The live actor of a socket's session, or null once it ended.
  async actorOf(sessionId: string): Promise<AuthActor | null> {
    const actor = await this.sessions.loadActor(sessionId);

    return actor && !isExpired(actor.session.expiresAt, this.clock.now())
      ? actor
      : null;
  }

  async sessionMayFollow(sessionId: string, traineeUserId: number) {
    const actor = await this.actorOf(sessionId);

    return (
      actor !== null && (await this.mayFollowTrainee(actor, traineeUserId))
    );
  }
}
