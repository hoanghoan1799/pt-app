// Socket.IO realtime: the namespace, event names, room names and timings.
// Names stay the same as the Ably events the web uses today, so the web switch
// is a transport swap. Payloads never carry message text.

export const REALTIME_NAMESPACE = "/chat";

// A browser asks for a ticket (POST /v1/realtime/ticket) and connects with
// `io(url + REALTIME_NAMESPACE, { auth: { ticket } })`; mobile sends
// `auth: { token }` with the opaque session token.
export const REALTIME_TICKET_TTL_SECONDS = 60;

export const REALTIME_EVENTS = {
  // server -> client
  message: "message",
  messageUpdate: "message-update",
  profileUpdate: "profile-update",
  read: "read",
  chatStatus: "chat-status",
  typing: "typing",
  inbox: "inbox",
  presence: "presence",
  dmUpdate: "dm:update",
  dmRead: "dm:read",
  authRevoked: "auth:revoked",
  // client -> server (acknowledged); `typing` goes both ways
  subscribe: "subscribe",
  unsubscribe: "unsubscribe",
  heartbeat: "heartbeat",
} as const;

export const REALTIME_REJECTIONS = [
  "unauthorized",
  "origin_not_allowed",
  "ticket_invalid",
  "session_expired",
  "admin_locked",
] as const;
export type RealtimeRejection = (typeof REALTIME_REJECTIONS)[number];

export const REALTIME_REVOKE_REASONS = [
  "signed_out",
  "session_expired",
  "locked",
] as const;
export type RealtimeRevokeReason = (typeof REALTIME_REVOKE_REASONS)[number];

// Rooms. A trainee joins their own conversation, their `user` room and their
// trainee chats on connect; an admin joins their `admin` room and an inbox
// room, and follows a conversation through the `subscribe` event (the same
// access rules as reading it over REST).
export const conversationRoom = (conversationId: number) =>
  `conv:${conversationId}`;
export const userRoom = (userId: number) => `user:${userId}`;
export const adminRoom = (adminId: number) => `admin:${adminId}`;
export const dmRoom = (conversationId: number) => `dm:${conversationId}`;
export const INBOX_SUPER_ROOM = "inbox:super";
export const inboxPtRoom = (adminId: number) => `inbox:pt:${adminId}`;
// Every trainee: told when the PT team goes online or offline.
export const TEAM_PRESENCE_ROOM = "presence:team";

// "đang nhập": a sender relays at most one typing event per interval; the
// indicator disappears this long after the last one arrived.
export const TYPING_THROTTLE_MS = 2500;
export const TYPING_EXPIRY_MS = 5000;

// Online = a heartbeat in the last two minutes (clients beat every minute) or a
// live socket.
export const PRESENCE_ONLINE_MS = 120_000;
export const PRESENCE_HEARTBEAT_MS = 60_000;
