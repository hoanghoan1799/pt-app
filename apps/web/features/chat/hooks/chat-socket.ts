"use client";

import { io, type Socket } from "socket.io-client";

import { ROUTES, SESSION_ROLE_PARAM } from "@/constants/routes";
import {
  type RealtimeState,
  realtimeStateFor,
} from "@/features/chat/utils/chat-thread-rules";

// One Socket.IO connection per role in this tab, shared by the thread, the
// inbox refresher, the DM thread and anything else that listens. It opens when
// the first listener arrives and closes after the last one leaves. Events carry
// ids only, so a listener's job is to fetch what is new; polling stays the
// fallback whenever the state is not "connected".

export type ChatRole = "user" | "admin";

export interface ChatSocketListener {
  onState?: (state: RealtimeState) => void;
  // Every server event, by name. Payloads are untrusted input.
  onEvent?: (name: string, data: unknown) => void;
  // Called on the first connect and after every reconnect: fill the gap.
  onConnect?: () => void;
  // Admins follow this conversation (`subscribe`); trainees are in theirs.
  conversationId?: number | null;
}

interface Ticket {
  ticket: string;
  namespace: string;
  url: string;
}

const TICKET_URL = "/api/chat/realtime-ticket";

const ticketUrl = (role: ChatRole) =>
  role === "admin" ? `${TICKET_URL}?as=admin` : TICKET_URL;

// What the web app does when the API ends the session under a live socket
// (sign-out elsewhere, expiry, passcode lock): the same pages the HTTP flow
// ends on.
export const revokedUrl = (role: ChatRole, reason: unknown) =>
  reason === "locked" && role === "admin"
    ? ROUTES.ADMIN_LOCK
    : `${ROUTES.SESSION_END}?${SESSION_ROLE_PARAM}=${role}`;

class Connection {
  private socket: Socket | null = null;
  private state: RealtimeState = "connecting";
  private readonly listeners = new Set<ChatSocketListener>();
  private opening = false;

  constructor(private readonly role: ChatRole) {}

  add(listener: ChatSocketListener) {
    this.listeners.add(listener);
    listener.onState?.(this.state);
    if (this.socket === null) {
      if (!this.opening) {
        void this.open();
      }
    } else if (this.socket.connected) {
      this.follow(listener);
      listener.onConnect?.();
    }
    return () => this.remove(listener);
  }

  private remove(listener: ChatSocketListener) {
    this.listeners.delete(listener);
    if (this.listeners.size === 0) {
      this.socket?.close();
      this.socket = null;
      this.state = "connecting";
      return;
    }
    const id = listener.conversationId;

    if (
      this.role === "admin" &&
      typeof id === "number" &&
      ![...this.listeners].some((other) => other.conversationId === id)
    ) {
      this.socket?.emit("unsubscribe", { conversationId: id });
    }
  }

  emitTyping(conversationId: number | null) {
    if (this.socket?.connected) {
      this.socket.emit(
        "typing",
        conversationId === null ? {} : { conversationId },
        () => undefined,
      );
    }
  }

  private set(state: RealtimeState) {
    if (state === this.state) {
      return;
    }
    this.state = state;
    this.listeners.forEach((listener) => listener.onState?.(state));
  }

  private follow(listener: ChatSocketListener) {
    if (this.role === "admin" && typeof listener.conversationId === "number") {
      this.socket?.emit(
        "subscribe",
        { conversationId: listener.conversationId },
        () => undefined,
      );
    }
  }

  // A fresh ticket for every connection attempt, so a reconnect after a drop
  // never reuses a spent one. 401/403/no URL = realtime is not for this
  // session: stop and let polling carry on.
  private async fetchTicket(): Promise<Ticket | null> {
    try {
      const response = await fetch(ticketUrl(this.role), {
        method: "POST",
        cache: "no-store",
      });

      if (response.status === 200) {
        const data = (await response.json()) as Partial<Ticket>;

        if (data.ticket && data.url) {
          return {
            ticket: data.ticket,
            namespace: data.namespace ?? "/chat",
            url: data.url,
          };
        }
      }
      if ([204, 401, 403].includes(response.status) || response.ok) {
        this.giveUp();
      }
    } catch {
      // Offline: Socket.IO retries with its own back-off.
    }
    return null;
  }

  private giveUp() {
    this.set("unavailable");
    this.socket?.close();
  }

  private async open() {
    this.opening = true;
    const first = await this.fetchTicket();

    this.opening = false;
    if (this.listeners.size === 0 || this.state === "unavailable") {
      return;
    }
    if (!first) {
      this.set("degraded");
      return;
    }
    let pending: Ticket | null = first;
    const socket = io(first.url + first.namespace, {
      // The ticket is fetched per attempt; the first one is already in hand.
      auth: (done) => {
        const send = (ticket: Ticket | null) =>
          done(ticket ? { ticket: ticket.ticket } : {});

        if (pending) {
          const ticket = pending;

          pending = null;
          send(ticket);
          return;
        }
        void this.fetchTicket().then(send);
      },
      transports: ["websocket", "polling"],
      reconnectionDelayMax: 15_000,
    });

    this.socket = socket;
    socket.on("connect", () => {
      this.set(realtimeStateFor("connect"));
      this.listeners.forEach((listener) => {
        this.follow(listener);
        listener.onConnect?.();
      });
    });
    socket.on("connect_error", () => {
      this.set(
        this.state === "unavailable"
          ? "unavailable"
          : realtimeStateFor("connect_error"),
      );
    });
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") {
        this.set(realtimeStateFor("disconnect"));
      }
    });
    socket.on("auth:revoked", (data: { reason?: unknown } | undefined) => {
      this.set("unavailable");
      socket.close();
      window.location.assign(revokedUrl(this.role, data?.reason));
    });
    socket.onAny((name: string, data: unknown) => {
      this.listeners.forEach((listener) => listener.onEvent?.(name, data));
    });
  }
}

const connections: Partial<Record<ChatRole, Connection>> = {};

const connectionFor = (role: ChatRole) =>
  (connections[role] ??= new Connection(role));

export const subscribeChatSocket = (
  role: ChatRole,
  listener: ChatSocketListener,
) => connectionFor(role).add(listener);

export const sendSocketTyping = (
  role: ChatRole,
  conversationId: number | null,
) => connectionFor(role).emitTyping(conversationId);

// The conversation a payload names, when it names one.
export const conversationIdOf = (data: unknown) => {
  const value = (data as { conversationId?: unknown } | null)?.conversationId;

  return typeof value === "number" ? value : null;
};
