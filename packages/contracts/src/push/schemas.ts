import {
  isAllowedPushEndpoint,
  PUSH_KINDS,
  PUSH_MAX_ENDPOINT_LENGTH,
  PUSH_MAX_KEY_LENGTH,
  PUSH_MESSAGES,
} from "./rules.js";
import { z } from "zod";

// REST shapes of the push subscriptions, and the payload the service worker
// receives (`{ title, body, url, tag }`).

// The browser's `PushSubscription.toJSON()`. `kind` defaults to 'web'; the
// mobile kinds (expo, fcm) are added with their senders.
export const pushSubscribeRequestSchema = z.object({
  kind: z.literal("web").default("web"),
  endpoint: z
    .string()
    .max(PUSH_MAX_ENDPOINT_LENGTH)
    .url()
    .refine(isAllowedPushEndpoint, PUSH_MESSAGES.INVALID_SUBSCRIPTION),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(PUSH_MAX_KEY_LENGTH),
    auth: z.string().trim().min(1).max(PUSH_MAX_KEY_LENGTH),
  }),
});
export type PushSubscribeRequest = z.infer<typeof pushSubscribeRequestSchema>;

export const pushUnsubscribeRequestSchema = z.object({
  endpoint: z.string().min(1).max(PUSH_MAX_ENDPOINT_LENGTH),
});
export type PushUnsubscribeRequest = z.infer<
  typeof pushUnsubscribeRequestSchema
>;

export const pushSubscriptionViewSchema = z.object({
  id: z.number().int(),
  kind: z.enum(PUSH_KINDS),
  endpoint: z.string(),
  userAgent: z.string(),
  createdAt: z.string(),
  lastSuccessAt: z.string().nullable(),
});
export type PushSubscriptionView = z.infer<typeof pushSubscriptionViewSchema>;

export const pushSubscriptionsResponseSchema = z.object({
  subscriptions: z.array(pushSubscriptionViewSchema),
});

// What a client needs before subscribing: is push on, and the VAPID public key.
export const pushConfigResponseSchema = z.object({
  web: z.object({
    enabled: z.boolean(),
    publicKey: z.string().nullable(),
  }),
});

export const pushPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  // A same-origin path the notification opens.
  url: z.string(),
  // A newer notification with the same tag replaces the older one.
  tag: z.string(),
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;
