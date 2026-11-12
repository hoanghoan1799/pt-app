import { Inject, Logger, type OnModuleDestroy } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import {
  adminRoom,
  conversationRoom,
  dmRoom,
  INBOX_SUPER_ROOM,
  inboxPtRoom,
  REALTIME_EVENTS,
  REALTIME_NAMESPACE,
  type RealtimeAck,
  realtimeSubscribeRequestSchema,
  realtimeTypingRequestSchema,
  TEAM_PRESENCE_ROOM,
  userRoom,
} from "@pt/contracts";
import type { Namespace, Socket } from "socket.io";
import { DataSource } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import { ChatAccess } from "../chat/chat.access.js";
import { ChatQueries } from "../chat/chat.queries.js";
import { APP_ENV } from "../config/app-config.module.js";
import type { Env } from "../config/env.schema.js";
import { isLockedOut } from "./gateway.rules.js";
import { PresenceRegistry } from "./presence.registry.js";
import { PresenceService } from "./presence.service.js";
import { RealtimeAudience } from "./realtime.audience.js";
import { RealtimeAuth } from "./realtime.auth.js";
import { RealtimeHub, sessionRoom, type SocketData } from "./realtime.hub.js";
import { TypingService } from "./typing.service.js";

const ack = (value: RealtimeAck): RealtimeAck => value;

// The `/chat` namespace. The handshake (ticket or token) runs as a namespace
// middleware, which also joins every room the account may hear, so the client's
// `connect` event means "ready". Clients cannot emit messages; they send
// `subscribe` / `unsubscribe` (admins follow a conversation), `typing` and
// `heartbeat`, each acknowledged.
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class ChatGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private readonly logger = new Logger(ChatGateway.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(APP_ENV) private readonly env: Env,
    private readonly auth: RealtimeAuth,
    private readonly hub: RealtimeHub,
    private readonly audience: RealtimeAudience,
    private readonly access: ChatAccess,
    private readonly chatQueries: ChatQueries,
    private readonly registry: PresenceRegistry,
    private readonly presence: PresenceService,
    private readonly typing: TypingService,
  ) {}

  afterInit(namespace: Namespace) {
    this.hub.attach(namespace);
    namespace.use((socket, next) => {
      this.authorize(socket)
        .then(() => next())
        .catch((error: unknown) => {
          next(
            error instanceof Error
              ? error
              : Object.assign(new Error("unauthorized"), {
                  data: { code: "unauthorized" },
                }),
          );
        });
    });
    this.timer = setInterval(() => {
      this.recheck().catch(() => undefined);
    }, this.env.REALTIME_RECHECK_SECONDS * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  // --- Handshake --------------------------------------------------------------

  private async authorize(socket: Socket) {
    const result = await this.auth.handshake(
      socket.handshake.headers.origin,
      socket.handshake.auth,
    );

    if (!result.ok) {
      throw Object.assign(new Error(result.code), {
        data: { code: result.code },
      });
    }
    const { actor } = result;
    const data: SocketData = {
      sessionId: actor.session.id,
      kind: actor.kind,
      id: actor.id,
    };

    socket.data = data;
    await this.joinRooms(socket, actor);
  }

  private async joinRooms(socket: Socket, actor: AuthActor) {
    const rooms = [sessionRoom(actor.session.id)];

    if (actor.kind === "user") {
      rooms.push(userRoom(actor.id), TEAM_PRESENCE_ROOM);
      const conversation = await this.chatQueries.findConversationByUserId(
        actor.id,
      );

      if (conversation) {
        rooms.push(conversationRoom(conversation.id));
      }
      const dms: { id: number }[] = await this.dataSource.query(
        `SELECT id FROM dm_conversations WHERE user_low = $1 OR user_high = $1`,
        [actor.id],
      );

      rooms.push(...dms.map((row) => dmRoom(row.id)));
    } else {
      rooms.push(adminRoom(actor.id));
      rooms.push(
        actor.role === "super_admin" ? INBOX_SUPER_ROOM : inboxPtRoom(actor.id),
      );
    }
    await socket.join(rooms);
  }

  handleConnection(socket: Socket) {
    const { kind, id } = socket.data as SocketData;

    if (this.registry.connect(`${kind}:${id}`)) {
      this.presence.cameOnline(kind, id).catch((error: unknown) => {
        this.logger.warn(`presence on connect failed: ${String(error)}`);
      });
    }
  }

  handleDisconnect(socket: Socket) {
    const data = socket.data as Partial<SocketData>;

    this.typing.forget(socket.id);
    if (data.kind === undefined || data.id === undefined) {
      return;
    }
    if (this.registry.disconnect(`${data.kind}:${data.id}`)) {
      this.presence.wentOffline(data.kind, data.id).catch((error: unknown) => {
        this.logger.warn(`presence on disconnect failed: ${String(error)}`);
      });
    }
  }

  // --- Re-check of live sessions ----------------------------------------------

  // Sign-out and lock close sockets at once (session events); this catches the
  // rest: an expired session, a lock by timeout, a deleted account.
  async recheck() {
    for (const { sessionId } of await this.hub.connectedSessions()) {
      const actor = await this.audience.actorOf(sessionId);

      if (!actor) {
        await this.hub.revokeSession(sessionId, "session_expired");
      } else if (isLockedOut(actor)) {
        await this.hub.revokeSession(sessionId, "locked");
      }
    }
  }

  // --- Client events ------------------------------------------------------------

  @SubscribeMessage(REALTIME_EVENTS.subscribe)
  async subscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<RealtimeAck> {
    const parsed = realtimeSubscribeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return ack({ ok: false, code: "invalid" });
    }
    const actor = await this.liveActor(socket);

    if (!actor) {
      return ack({ ok: false, code: "unauthorized" });
    }
    try {
      // The same decision as reading the conversation over REST.
      await this.access.forConversation(actor, parsed.data.conversationId);
    } catch {
      return ack({ ok: false, code: "not_found" });
    }
    await socket.join(conversationRoom(parsed.data.conversationId));
    return ack({ ok: true });
  }

  @SubscribeMessage(REALTIME_EVENTS.unsubscribe)
  async unsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<RealtimeAck> {
    const parsed = realtimeSubscribeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return ack({ ok: false, code: "invalid" });
    }
    await socket.leave(conversationRoom(parsed.data.conversationId));
    return ack({ ok: true });
  }

  @SubscribeMessage(REALTIME_EVENTS.typing)
  async onTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<RealtimeAck> {
    const parsed = realtimeTypingRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      return ack({ ok: false, code: "invalid" });
    }
    const actor = await this.liveActor(socket);

    if (!actor) {
      return ack({ ok: false, code: "unauthorized" });
    }
    try {
      const relayed = await this.typing.relay(
        actor,
        parsed.data.conversationId,
        socket.id,
        socket.id,
      );

      return ack({ ok: true, relayed });
    } catch (error) {
      return ack({ ok: false, code: codeOf(error) });
    }
  }

  @SubscribeMessage(REALTIME_EVENTS.heartbeat)
  async onHeartbeat(@ConnectedSocket() socket: Socket): Promise<RealtimeAck> {
    const actor = await this.liveActor(socket);

    if (!actor || isLockedOut(actor)) {
      return ack({ ok: false, code: "unauthorized" });
    }
    await this.presence.heartbeat(actor);
    return ack({ ok: true });
  }

  private liveActor(socket: Socket) {
    const sessionId = (socket.data as Partial<SocketData>).sessionId;

    return sessionId ? this.audience.actorOf(sessionId) : Promise.resolve(null);
  }
}

const codeOf = (error: unknown) => {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  const code =
    typeof response === "object" && response !== null
      ? (response as { code?: unknown }).code
      : undefined;

  switch (code) {
    case "CHAT_LOCKED":
      return "chat_locked";
    case "CONVERSATION_NOT_FOUND":
      return "not_found";
    default:
      return "error";
  }
};
