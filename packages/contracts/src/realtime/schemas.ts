import { REALTIME_REJECTIONS, REALTIME_REVOKE_REASONS } from "./constants.js";
import { z } from "zod";

// Shapes of the realtime REST routes and of the Socket.IO payloads.

const positiveInt = z.number().int().positive();

// --- REST -------------------------------------------------------------------

export const realtimeTicketResponseSchema = z.object({
  // Single use; send it as `auth: { ticket }` within `expiresInSeconds`.
  ticket: z.string(),
  expiresInSeconds: z.number().int(),
  namespace: z.string(),
});
export type RealtimeTicketResponse = z.infer<
  typeof realtimeTicketResponseSchema
>;

export const realtimePresencePeerQuerySchema = z.object({
  // Admins name the trainee; a trainee asks about the PT team and sends none.
  userId: z.coerce.number().int().positive().optional(),
});
export type RealtimePresencePeerQuery = z.infer<
  typeof realtimePresencePeerQuerySchema
>;

export const realtimePresencePeerResponseSchema = z.object({
  // Null when never seen (or, for the PT team, when every PT hides it).
  peerLastSeenAt: z.string().nullable(),
  // The server clock, so a client judges "online" on it, not on its own.
  serverNow: z.string(),
  // A live socket, or a heartbeat in the last two minutes.
  peerOnline: z.boolean(),
});
export type RealtimePresencePeerResponse = z.infer<
  typeof realtimePresencePeerResponseSchema
>;

// --- Socket.IO: server -> client ---------------------------------------------

export const realtimeMessageEventSchema = z.object({
  id: positiveInt,
  conversationId: positiveInt,
  senderRole: z.enum(["user", "admin"]),
  senderAdminId: positiveInt.nullable(),
  clientId: z.string(),
});

export const realtimeMessageUpdateEventSchema = z.object({
  conversationId: positiveInt,
  messageId: positiveInt,
});

export const realtimeProfileUpdateEventSchema = z.object({
  conversationId: positiveInt,
});

export const realtimeReadEventSchema = z.object({
  conversationId: positiveInt,
  readerKey: z.string(),
  lastReadMessageId: z.number().int().nonnegative(),
});

export const realtimeChatStatusEventSchema = z.object({
  enabled: z.boolean(),
});

export const realtimeInboxEventSchema = z.object({
  conversationId: positiveInt,
  messageId: positiveInt,
  senderRole: z.enum(["user", "admin"]),
});

export const realtimeTypingEventSchema = z.object({
  role: z.enum(["user", "admin"]),
  // `user:<id>` / `admin:<id>`: a second tab of the same person ignores it.
  senderKey: z.string(),
  conversationId: positiveInt,
});
export type RealtimeTypingEvent = z.infer<typeof realtimeTypingEventSchema>;

export const realtimePresenceEventSchema = z.object({
  role: z.enum(["user", "admin"]),
  // A trainee's id; null for the PT team as a whole.
  userId: positiveInt.nullable(),
  online: z.boolean(),
  lastSeenAt: z.string().nullable(),
});

export const realtimeDmUpdateEventSchema = z.object({
  conversationId: positiveInt,
  messageId: positiveInt,
  senderId: positiveInt,
});

export const realtimeDmReadEventSchema = z.object({
  conversationId: positiveInt,
  userId: positiveInt,
  lastReadMessageId: z.number().int().nonnegative(),
});

export const realtimeAuthRevokedEventSchema = z.object({
  reason: z.enum(REALTIME_REVOKE_REASONS),
});

// The `connect_error` data of a refused handshake.
export const realtimeRejectionSchema = z.object({
  code: z.enum(REALTIME_REJECTIONS),
});

// --- Socket.IO: client -> server ---------------------------------------------

export const realtimeSubscribeRequestSchema = z.object({
  conversationId: positiveInt,
});
export type RealtimeSubscribeRequest = z.infer<
  typeof realtimeSubscribeRequestSchema
>;

export const realtimeTypingRequestSchema = z.object({
  // A trainee may omit it (their own conversation).
  conversationId: positiveInt.optional(),
});
export type RealtimeTypingRequest = z.infer<typeof realtimeTypingRequestSchema>;

// The acknowledgement of every client event.
export const realtimeAckSchema = z.object({
  ok: z.boolean(),
  // Stable code of a refusal: not_found, chat_locked, invalid.
  code: z.string().optional(),
  // typing only: false when the rate limit dropped it.
  relayed: z.boolean().optional(),
});
export type RealtimeAck = z.infer<typeof realtimeAckSchema>;
