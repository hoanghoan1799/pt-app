import { Injectable } from "@nestjs/common";
import {
  adminRoom,
  conversationRoom,
  REALTIME_EVENTS,
  type RealtimeRevokeReason,
  userRoom,
} from "@pt/contracts";
import type { Namespace } from "socket.io";

import type { Emission } from "./event-mapping.js";
import { RealtimeAudience } from "./realtime.audience.js";

// What the gateway keeps on every socket after the handshake.
export type SocketData = {
  sessionId: string;
  kind: "user" | "admin";
  id: number;
};

export const sessionRoom = (sessionId: string) => `session:${sessionId}`;

// The only place that writes to sockets. The gateway hands it the namespace;
// everything else (listeners, presence, typing) calls `perform`. A single
// instance owns every socket; a second instance needs the Socket.IO Redis
// adapter (`@socket.io/redis-adapter`, `server.adapter(createAdapter(pub,
// sub))` in RealtimeIoAdapter) so `in(room).fetchSockets()` and `emit` span
// instances. Nothing else here changes.
@Injectable()
export class RealtimeHub {
  private namespace: Namespace | null = null;

  constructor(private readonly audience: RealtimeAudience) {}

  attach(namespace: Namespace) {
    this.namespace = namespace;
  }

  get attached() {
    return this.namespace !== null;
  }

  async perform(emissions: Emission[]) {
    for (const emission of emissions) {
      await this.performOne(emission);
    }
  }

  private async performOne(emission: Emission) {
    const namespace = this.namespace;

    if (!namespace) {
      return;
    }
    if (emission.joinTraineeUserId) {
      namespace
        .in(userRoom(emission.joinTraineeUserId.userId))
        .socketsJoin(
          conversationRoom(emission.joinTraineeUserId.conversationId),
        );
    }
    const delivered = new Set<string>();
    // One answer per session and trainee within this emission.
    const verdicts = new Map<string, boolean>();

    for (const room of emission.rooms) {
      for (const socket of await namespace.in(room).fetchSockets()) {
        const data = socket.data as Partial<SocketData>;

        if (delivered.has(socket.id) || socket.id === emission.exceptSocketId) {
          continue;
        }
        if (
          emission.guardTraineeUserId !== undefined &&
          data.kind === "admin" &&
          data.sessionId !== undefined
        ) {
          const verdict =
            verdicts.get(data.sessionId) ??
            (await this.audience.sessionMayFollow(
              data.sessionId,
              emission.guardTraineeUserId,
            ));

          verdicts.set(data.sessionId, verdict);
          if (!verdict) {
            // No longer allowed (hidden again, locked, scope changed): stop
            // following this conversation as well.
            if (room.startsWith("conv:")) {
              socket.leave(room);
            }
            continue;
          }
        }
        delivered.add(socket.id);
        socket.emit(emission.event, emission.data);
      }
    }
  }

  // Tells the sockets of a session why they are going, then closes them.
  async revokeSession(sessionId: string, reason: RealtimeRevokeReason) {
    const room = this.namespace?.in(sessionRoom(sessionId));

    if (!room) {
      return;
    }
    room.emit(REALTIME_EVENTS.authRevoked, { reason });
    room.disconnectSockets(true);
  }

  // Every session of an account except one (password change, admin reset).
  async revokeAccount(
    kind: "user" | "admin",
    id: number,
    exceptSessionId: string | null,
    reason: RealtimeRevokeReason,
  ) {
    const namespace = this.namespace;

    if (!namespace) {
      return;
    }
    const sockets = await namespace
      .in(kind === "user" ? userRoom(id) : adminRoom(id))
      .fetchSockets();

    for (const socket of sockets) {
      const sessionId = (socket.data as Partial<SocketData>).sessionId;

      if (sessionId !== undefined && sessionId !== exceptSessionId) {
        socket.emit(REALTIME_EVENTS.authRevoked, { reason });
        socket.disconnect(true);
      }
    }
  }

  // Each connected session once, for the periodic re-check.
  async connectedSessions() {
    const namespace = this.namespace;

    if (!namespace) {
      return [];
    }
    const seen = new Map<string, SocketData>();

    for (const socket of await namespace.fetchSockets()) {
      const data = socket.data as Partial<SocketData>;

      if (data.sessionId !== undefined && data.kind && data.id !== undefined) {
        seen.set(data.sessionId, data as SocketData);
      }
    }
    return [...seen.values()];
  }
}
