import type { PushKind, PushPayload } from "@pt/contracts";

// The push sender strategy: one implementation per `push_subscriptions.kind`,
// all registered under PUSH_SENDERS. PushService picks by the subscription's
// kind. WebPushSender exists today; an ExpoPushSender and an FcmPushSender are
// each one new class plus one more entry in the PushModule factory.
export const PUSH_SENDERS = Symbol("PUSH_SENDERS");

// What a sender needs from a stored subscription. Web rows keep the Web Push
// keys; expo / fcm rows keep the device token in `endpoint`.
export type StoredPushSubscription = {
  id: number;
  ownerKey: string;
  kind: PushKind;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
};

// ok: delivered. gone: the push service says the subscription is dead for good
// (404/410), delete it. retry: a temporary failure (network, 429, 5xx), try
// again. failed: refused for a reason a retry will not change (log it).
export type PushSendResult = "ok" | "gone" | "retry" | "failed";

export interface PushSender {
  readonly kind: PushKind;
  // False when the sender is not configured (no VAPID keys): nothing is sent.
  readonly enabled: boolean;
  send(
    subscription: StoredPushSubscription,
    payload: PushPayload,
  ): Promise<PushSendResult>;
}
