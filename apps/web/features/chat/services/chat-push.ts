import "server-only";

// LEGACY, kept only for the social notifications that still send push from
// this app (dm-notify, social-notifications). Chat push now lives in the API
// (apps/api/src/push) with the subscriptions; delete this file with the social
// switch.
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";

import { db } from "@/db";
import { admins as adminsTable, pushSubscriptions, users } from "@/db/schema";
import {
  ADMIN_OWNER_PREFIX,
  adminOwnerKey,
  type ChatPushPayload,
  isGoneStatus,
  userOwnerKey,
} from "@/features/chat/utils/push-rules";
import { getVapidConfig } from "@/services/env";
import { logServerError } from "@/services/logger";
import { type Locale, parseLocale } from "@/utils/locale";

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

export const sendWithWebPush: PushSender = (subscription, payload, vapid) =>
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

export const getVapid = () => {
  const config = getVapidConfig();

  if (!config && !warned) {
    warned = true;
    console.warn("[pt-app] VAPID_* missing: web push is skipped");
  }
  return config;
};

const ownerIdOf = (ownerKey: string, prefix: string) =>
  ownerKey.startsWith(prefix) ? Number(ownerKey.slice(prefix.length)) : NaN;

// The language each push recipient chose (users.locale / admins.locale, null
// = Vietnamese), keyed by owner key. A push is built per recipient language,
// not from the sender's or the request's.
export const loadOwnerLocales = async (
  ownerKeys: string[],
): Promise<Map<string, Locale>> => {
  const userIds = ownerKeys
    .map((key) => ownerIdOf(key, "user:"))
    .filter(Number.isFinite);
  const adminIds = ownerKeys
    .map((key) => ownerIdOf(key, ADMIN_OWNER_PREFIX))
    .filter(Number.isFinite);
  const [userRows, adminRows] = await Promise.all([
    userIds.length
      ? db
          .select({ id: users.id, locale: users.locale })
          .from(users)
          .where(inArray(users.id, userIds))
      : [],
    adminIds.length
      ? db
          .select({ id: adminsTable.id, locale: adminsTable.locale })
          .from(adminsTable)
          .where(inArray(adminsTable.id, adminIds))
      : [],
  ]);

  return new Map<string, Locale>([
    ...userRows.map(
      (row) => [userOwnerKey(row.id), parseLocale(row.locale)] as const,
    ),
    ...adminRows.map(
      (row) => [adminOwnerKey(row.id), parseLocale(row.locale)] as const,
    ),
  ]);
};

// Sends one payload per recipient language. Owners without a stored locale
// (or no longer in the database) get Vietnamese.
export const deliverLocalized = async (
  targets: StoredSubscription[],
  buildPayload: (locale: Locale) => ChatPushPayload,
  vapid: VapidConfig,
  sender: PushSender,
) => {
  const locales = await loadOwnerLocales([
    ...new Set(targets.map((target) => target.ownerKey)),
  ]);
  const groups = new Map<Locale, StoredSubscription[]>();

  for (const target of targets) {
    const locale = locales.get(target.ownerKey) ?? parseLocale(null);

    groups.set(locale, [...(groups.get(locale) ?? []), target]);
  }
  await Promise.all(
    [...groups].map(([locale, group]) =>
      deliver(group, buildPayload(locale), vapid, sender),
    ),
  );
};

export const deliver = async (
  targets: StoredSubscription[],
  payload: ChatPushPayload,
  vapid: VapidConfig,
  sender: PushSender,
) => {
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
};
