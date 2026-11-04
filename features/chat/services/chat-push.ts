import "server-only";

import { and, eq, like } from "drizzle-orm";
import { after } from "next/server";
import webpush from "web-push";

import { db } from "@/db";
import { pushSubscriptions, users } from "@/db/schema";
import {
  ADMIN_OWNER_PREFIX,
  buildChatPushPayload,
  type ChatPushPayload,
  isGoneStatus,
  type PushSubscriptionInput,
  userOwnerKey,
} from "@/features/chat/utils/push-rules";
import { getVapidConfig } from "@/services/env";
import { logServerError } from "@/services/logger";

const PUSH_TTL_SECONDS = 3600;

type StoredSubscription = typeof pushSubscriptions.$inferSelect;
type VapidConfig = NonNullable<ReturnType<typeof getVapidConfig>>;

// Resolves on delivery; rejects with an error carrying `statusCode` (the
// web-push WebPushError shape) otherwise.
export type PushSender = (
  subscription: Pick<StoredSubscription, "endpoint" | "p256dh" | "auth">,
  payload: ChatPushPayload,
  vapid: VapidConfig,
) => Promise<unknown>;

const sendWithWebPush: PushSender = (subscription, payload, vapid) =>
  webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
    {
      vapidDetails: {
        subject: vapid.subject,
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey,
      },
      TTL: PUSH_TTL_SECONDS,
      urgency: "high",
      topic: payload.tag,
    },
  );

let warned = false;

// Test seam: forget the one-time warning.
export const resetChatPushForTests = () => {
  warned = false;
};

const getVapid = () => {
  const config = getVapidConfig();

  if (!config && !warned) {
    warned = true;
    console.warn("[pt-app] VAPID_* missing: web push is skipped");
  }
  return config;
};

// A browser re-subscribing, or another account on the same device, reuses the
// endpoint: the row just changes owner.
export const saveSubscription = async (
  ownerKey: string,
  subscription: PushSubscriptionInput,
  userAgent: string,
) => {
  const values = {
    ownerKey,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent: userAgent.slice(0, 255),
  };

  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        ownerKey: values.ownerKey,
        p256dh: values.p256dh,
        auth: values.auth,
        userAgent: values.userAgent,
      },
    });
};

// Scoped to the owner: nobody can remove another account's subscription by
// guessing its endpoint.
export const deleteSubscription = async (
  ownerKey: string,
  endpoint: string,
) => {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.ownerKey, ownerKey),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
};

export interface SendChatPushInput {
  // Who wrote the message; the other side gets the push.
  senderRole: "user" | "admin";
  traineeUserId: number;
  conversationId: number;
}

const loadTargets = (senderRole: "user" | "admin", traineeUserId: number) =>
  db
    .select()
    .from(pushSubscriptions)
    .where(
      senderRole === "user"
        ? like(pushSubscriptions.ownerKey, `${ADMIN_OWNER_PREFIX}%`)
        : eq(pushSubscriptions.ownerKey, userOwnerKey(traineeUserId)),
    );

// Never throws and never logs the payload or any message body: only ids and
// counts. Trainee message -> every admin's devices; admin message -> the
// trainee's devices. 404/410 means the subscription is dead and is dropped.
export const sendChatPush = async (
  { senderRole, traineeUserId, conversationId }: SendChatPushInput,
  sender: PushSender = sendWithWebPush,
) => {
  try {
    const vapid = getVapid();

    if (!vapid) {
      return;
    }
    const targets = await loadTargets(senderRole, traineeUserId);

    if (targets.length === 0) {
      return;
    }
    const recipientRole = senderRole === "user" ? "admin" : "user";
    let traineeName = "";

    if (recipientRole === "admin") {
      const [trainee] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, traineeUserId));

      traineeName = trainee?.name ?? "Học viên";
    }
    const payload = buildChatPushPayload({
      recipientRole,
      traineeName,
      traineeUserId,
      conversationId,
    });

    await Promise.all(
      targets.map(async (target) => {
        try {
          await sender(target, payload, vapid);
          await db
            .update(pushSubscriptions)
            .set({ lastSuccessAt: new Date() })
            .where(eq(pushSubscriptions.id, target.id));
        } catch (error) {
          const statusCode = (error as { statusCode?: number })?.statusCode;

          if (isGoneStatus(statusCode)) {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, target.id));
            return;
          }
          logServerError("sendChatPush", error, {
            subscriptionId: target.id,
            statusCode,
          });
        }
      }),
    );
  } catch (error) {
    logServerError("sendChatPush", error, { conversationId });
  }
};

// Called after a NEW message was stored. Runs after the response when inside
// a request (Next's after()), otherwise fire-and-forget; either way the send
// never blocks or fails the action.
export const schedulePush = (input: SendChatPushInput) => {
  try {
    after(() => sendChatPush(input));
  } catch {
    void sendChatPush(input);
  }
};
