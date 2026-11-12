import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  conversationRoom,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_ONLINE_MS,
  REALTIME_EVENTS,
  type RealtimePresencePeerResponse,
  TEAM_PRESENCE_ROOM,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import { TraineeNotFoundError } from "../auth/auth.errors.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import { SessionsService } from "../auth/sessions.service.js";
import { TraineeScopeQueries } from "../auth/trainee-scope.queries.js";
import { Clock } from "../common/clock.js";
import type { Emission } from "./event-mapping.js";
import { type PresenceKey, PresenceRegistry } from "./presence.registry.js";
import { RealtimeHub } from "./realtime.hub.js";

// Whole seconds, like the column the web wrote.
const toSeconds = (ms: number) => new Date(Math.floor(ms / 1000) * 1000);

export const isRecentlySeen = (
  lastSeenAt: Date | null,
  now: Date,
  windowMs = PRESENCE_ONLINE_MS,
) => lastSeenAt !== null && now.getTime() - lastSeenAt.getTime() < windowMs;

const keyOf = (kind: "user" | "admin", id: number): PresenceKey =>
  `${kind}:${id}`;

export type TeamStatus = { online: boolean; lastSeenAt: Date | null };

// Online status and last seen. Online = a live socket, or a heartbeat in the
// last two minutes (polling clients). `presence_hidden` admins are left out of
// what trainees see, as before.
@Injectable()
export class PresenceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clock: Clock,
    private readonly registry: PresenceRegistry,
    private readonly sessions: SessionsService,
    private readonly scope: PtScopePolicy,
    private readonly scopeQueries: TraineeScopeQueries,
    private readonly hub: RealtimeHub,
  ) {}

  // One conditional UPDATE: writes only when never seen or the last beat is at
  // least a minute old (`force` for connect and disconnect), so a busy tab
  // costs at most one write a minute.
  async touch(kind: "user" | "admin", id: number, force = false) {
    const now = this.clock.now().getTime();
    const table = kind === "user" ? "users" : "admins";

    await this.dataSource.query(
      `UPDATE ${table} SET last_seen_at = $1
       WHERE id = $2 AND ($4::boolean OR last_seen_at IS NULL OR last_seen_at <= $3)`,
      [toSeconds(now), id, toSeconds(now - PRESENCE_HEARTBEAT_MS), force],
    );
  }

  // The heartbeat: presence, and for an unlocked admin the sliding unlock
  // window (it never re-locks a locked session).
  async heartbeat(actor: AuthActor) {
    await this.touch(actor.kind, actor.id);
    if (actor.kind === "admin" && actor.hasPasscode) {
      await this.sessions.extendUnlock(actor.session.id);
    }
  }

  async teamStatus(socketOnly = false): Promise<TeamStatus> {
    const now = this.clock.now();
    const rows: { id: number; lastSeenAt: Date | null }[] =
      await this.dataSource.query(
        `SELECT id, last_seen_at AS "lastSeenAt" FROM admins
         WHERE presence_hidden IS NOT TRUE`,
      );
    const visible = new Set(rows.map((row) => row.id));
    const connected = this.registry
      .onlineAdminIds()
      .some((adminId) => visible.has(adminId));
    const newest = rows.reduce<Date | null>(
      (latest, row) =>
        row.lastSeenAt && (latest === null || row.lastSeenAt > latest)
          ? row.lastSeenAt
          : latest,
      null,
    );

    return connected
      ? { online: true, lastSeenAt: toSeconds(now.getTime()) }
      : {
          online: !socketOnly && isRecentlySeen(newest, now),
          lastSeenAt: newest,
        };
  }

  async traineeStatus(userId: number, socketOnly = false): Promise<TeamStatus> {
    const now = this.clock.now();
    const rows: { lastSeenAt: Date | null }[] = await this.dataSource.query(
      `SELECT last_seen_at AS "lastSeenAt" FROM users WHERE id = $1`,
      [userId],
    );

    if (rows.length === 0) {
      throw new TraineeNotFoundError();
    }
    if (this.registry.isOnline(keyOf("user", userId))) {
      return { online: true, lastSeenAt: toSeconds(now.getTime()) };
    }
    const lastSeenAt = rows[0].lastSeenAt;

    return {
      online: !socketOnly && isRecentlySeen(lastSeenAt, now),
      lastSeenAt,
    };
  }

  // The other side, for polling clients: a trainee asks about the PT team, an
  // admin about one trainee in their reach (404 like any out-of-scope trainee).
  async peer(
    actor: AuthActor,
    userId: number | undefined,
  ): Promise<RealtimePresencePeerResponse> {
    let status: TeamStatus;

    if (actor.kind === "user") {
      status = await this.teamStatus();
    } else {
      if (userId === undefined) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "userId: required",
        });
      }
      const facts = await this.scopeQueries.findByUserId(actor.id, userId);

      if (!facts || !this.scope.canAccessTrainee(actor, facts)) {
        throw new TraineeNotFoundError();
      }
      status = await this.traineeStatus(userId);
    }
    return {
      peerLastSeenAt: status.lastSeenAt
        ? status.lastSeenAt.toISOString()
        : null,
      serverNow: this.clock.now().toISOString(),
      peerOnline: status.online,
    };
  }

  // --- Socket lifecycle -------------------------------------------------------

  // Called by the gateway when an account's first socket opened.
  async cameOnline(kind: "user" | "admin", id: number) {
    await this.touch(kind, id, true);
    await this.hub.perform(await this.broadcastFor(kind, id));
  }

  // The last socket of an account closed: last seen is now.
  async wentOffline(kind: "user" | "admin", id: number) {
    await this.touch(kind, id, true);
    await this.hub.perform(await this.broadcastFor(kind, id));
  }

  // An admin switched "activity status" on or off.
  async hiddenChanged() {
    await this.hub.perform(await this.teamBroadcast());
  }

  private async broadcastFor(
    kind: "user" | "admin",
    id: number,
  ): Promise<Emission[]> {
    if (kind === "admin") {
      return this.teamBroadcast();
    }
    const conversations: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM chat_conversations WHERE user_id = $1`,
      [id],
    );
    const conversation = conversations[0];

    if (!conversation) {
      return [];
    }
    const status = await this.traineeStatus(id, true);

    return [
      {
        event: REALTIME_EVENTS.presence,
        data: {
          role: "user",
          userId: id,
          online: status.online,
          lastSeenAt: status.lastSeenAt?.toISOString() ?? null,
        },
        rooms: [conversationRoom(conversation.id)],
        guardTraineeUserId: id,
      },
    ];
  }

  private async teamBroadcast(): Promise<Emission[]> {
    const status = await this.teamStatus(true);

    return [
      {
        event: REALTIME_EVENTS.presence,
        data: {
          role: "admin",
          userId: null,
          online: status.online,
          lastSeenAt: status.lastSeenAt?.toISOString() ?? null,
        },
        rooms: [TEAM_PRESENCE_ROOM],
      },
    ];
  }
}
