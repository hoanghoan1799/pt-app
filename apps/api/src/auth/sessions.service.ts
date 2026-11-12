import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, IsNull, LessThanOrEqual, Not } from "typeorm";

import { Clock } from "../common/clock.js";
import { Session } from "../database/entities/session.entity.js";
import {
  type AuthActor,
  buildAdminActor,
  buildUserActor,
  type ClientKind,
} from "./actor.js";
import {
  computeSlide,
  expiryFor,
  isExpired,
  revealExpiry,
  unlockExpiry,
} from "./session-rules.js";
import { generateToken, hashToken } from "./session-token.js";
import {
  type LoadedSession,
  SessionQueries,
  type SubjectRef,
} from "./sessions.queries.js";

export type ClientContext = {
  clientKind: ClientKind;
  clientName?: string | null;
  userAgent?: string | null;
  ip?: string | null;
};

export type CreateSessionInput = {
  subject: SubjectRef;
  client: ClientContext;
};

const subjectColumns = (subject: SubjectRef) =>
  subject.kind === "user" ? { userId: subject.id } : { adminId: subject.id };

// Every write to `sessions`. Tokens are generated here and only their SHA-256
// hash is stored; the plain token is returned once to the caller.
@Injectable()
export class SessionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clock: Clock,
    private readonly queries: SessionQueries,
  ) {}

  private get repo() {
    return this.dataSource.getRepository(Session);
  }

  // The one place a login ends, whatever the credential method was.
  async create({ subject, client }: CreateSessionInput) {
    const now = this.clock.now();
    const token = generateToken();
    const session = await this.repo.save(
      this.repo.create({
        tokenHash: hashToken(token),
        subjectKind: subject.kind,
        ...subjectColumns(subject),
        clientKind: client.clientKind,
        clientName: client.clientName ?? null,
        userAgent: client.userAgent?.slice(0, 512) ?? null,
        ip: client.ip ?? null,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: expiryFor(subject.kind, now),
        unlockedUntil: null,
        revealedUntil: null,
      }),
    );

    return { token, sessionId: session.id };
  }

  // Token -> actor, or null for anything unknown or expired. Slides the expiry
  // and last_seen_at when due.
  async authenticate(token: string): Promise<AuthActor | null> {
    const loaded = await this.queries.findByTokenHash(hashToken(token));

    if (!loaded) {
      return null;
    }
    const now = this.clock.now();

    if (isExpired(loaded.state.expiresAt, now)) {
      await this.repo.delete({ id: loaded.state.id });
      return null;
    }

    const patch = computeSlide(loaded.state, now);

    if (patch) {
      await this.repo.update({ id: loaded.state.id }, patch);
      Object.assign(loaded.state, patch);
    }
    return this.toActor(loaded, now);
  }

  async loadActor(sessionId: string): Promise<AuthActor | null> {
    const loaded = await this.queries.findById(sessionId);

    return loaded ? this.toActor(loaded, this.clock.now()) : null;
  }

  // New token for the same session (same id, same unlock and reveal state),
  // expiry renewed. The update matches the old hash, so of two parallel
  // refreshes with one token only one wins.
  async rotate(sessionId: string, currentTokenHash: Buffer) {
    const now = this.clock.now();
    const token = generateToken();
    const session = await this.repo.findOne({ where: { id: sessionId } });

    if (!session) {
      return null;
    }

    const result = await this.repo.update(
      { id: sessionId, tokenHash: currentTokenHash },
      {
        tokenHash: hashToken(token),
        lastSeenAt: now,
        expiresAt: expiryFor(session.subjectKind, now),
      },
    );

    return result.affected === 1 ? token : null;
  }

  async revoke(sessionId: string) {
    await this.repo.delete({ id: sessionId });
  }

  // Every session of a subject except one: password change signs the other
  // devices out; an admin password reset passes no exception.
  async revokeAll(subject: SubjectRef, exceptSessionId?: string) {
    await this.repo.delete({
      ...subjectColumns(subject),
      ...(exceptSessionId ? { id: Not(exceptSessionId) } : {}),
    });
  }

  // Right passcode: unlocked for 5 minutes, and the reveal of hidden trainees
  // ends (coming back from a lock starts without them).
  async unlock(sessionId: string, options: { keepReveal?: boolean } = {}) {
    await this.repo.update(
      { id: sessionId },
      {
        unlockedUntil: unlockExpiry(this.clock.now()),
        ...(options.keepReveal ? {} : { revealedUntil: null }),
      },
    );
  }

  // Presence heartbeat while unlocked: a sliding window, never re-locks.
  async extendUnlock(sessionId: string) {
    await this.repo.update(
      { id: sessionId, unlockedUntil: Not(IsNull()) },
      { unlockedUntil: unlockExpiry(this.clock.now()) },
    );
  }

  // "Lock now" and sign-out both end the reveal as well.
  async lock(sessionId: string) {
    await this.repo.update(
      { id: sessionId },
      { unlockedUntil: null, revealedUntil: null },
    );
  }

  // Fixed 10 minute window, not refreshed by the heartbeat.
  async reveal(sessionId: string) {
    const until = revealExpiry(this.clock.now());

    await this.repo.update({ id: sessionId }, { revealedUntil: until });
    return until;
  }

  async purgeExpired() {
    const result = await this.repo.delete({
      expiresAt: LessThanOrEqual(this.clock.now()),
    });

    return result.affected ?? 0;
  }

  private toActor(loaded: LoadedSession, now: Date): AuthActor {
    return loaded.subject.kind === "user"
      ? buildUserActor(loaded.state, loaded.subject.row)
      : buildAdminActor(loaded.state, loaded.subject.row, now);
  }
}
