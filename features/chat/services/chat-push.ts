import "server-only";

import { and, eq, inArray, like } from "drizzle-orm";
import { after } from "next/server";
import webpush from "web-push";

import { db } from "@/db";
import {
  adminHiddenUsers,
  admins as adminsTable,
  pushSubscriptions,
  users,
} from "@/db/schema";
import {
  ADMIN_OWNER_PREFIX,
  adminOwnerKey,
  buildChatPushPayload,
  buildReactionPushPayload,
  type ChatPushPayload,
  isGoneStatus,
  type PushSubscriptionInput,
  userOwnerKey,
} from "@/features/chat/utils/push-rules";
import {
  loadAliases,
  loadAliasesForOwners,
} from "@/features/contact-aliases/services/contact-aliases";
import {
  adminActorKey,
  PT_ALIAS_TARGET,
  userActorKey,
} from "@/features/contact-aliases/utils/alias-rules";
import { getPushTranslator } from "@/i18n/push-translator";
import { isUserInAdminScope, toAdminRole } from "@/services/admin-scope";
import { getVapidConfig } from "@/services/env";
import { isUserHidden } from "@/services/hidden-users";
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
  // The sending admin (for the push title when the trainee is notified).
  senderAdminId?: number | null;
  // Message text for the push preview; never logged.
  body?: string | null;
  // The message is a sticker (the preview becomes a kind label).
  sticker?: boolean;
  // The message carries a photo (KAN-160): the preview becomes a kind label.
  photo?: boolean;
}

const loadTargets = async (
  senderRole: "user" | "admin",
  traineeUserId: number,
) => {
  if (senderRole === "admin") {
    return db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.ownerKey, userOwnerKey(traineeUserId)));
  }
  const [targets, hidden, admins] = await Promise.all([
    db
      .select()
      .from(pushSubscriptions)
      .where(like(pushSubscriptions.ownerKey, `${ADMIN_OWNER_PREFIX}%`)),
    db
      .select({ adminId: adminHiddenUsers.adminId })
      .from(adminHiddenUsers)
      .where(eq(adminHiddenUsers.userId, traineeUserId)),
    db.select({ id: adminsTable.id, role: adminsTable.role }).from(adminsTable),
  ]);
  const hiddenKeys = new Set(hidden.map((row) => adminOwnerKey(row.adminId)));
  const [trainee] = await db
    .select({ ptAdminId: users.ptAdminId })
    .from(users)
    .where(eq(users.id, traineeUserId));
  // P1: super admins plus this trainee's own PT; other PTs get nothing.
  const outOfScopeKeys = new Set(
    admins
      .filter(
        (admin) =>
          toAdminRole(admin.role) === "pt" &&
          admin.id !== (trainee?.ptAdminId ?? null),
      )
      .map((admin) => adminOwnerKey(admin.id)),
  );

  // KAN-163: an admin who hid this trainee gets no push for them.
  return targets.filter(
    (target) =>
      !hiddenKeys.has(target.ownerKey) && !outOfScopeKeys.has(target.ownerKey),
  );
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

// Never throws and never logs the payload or any message body (the body is
// in the push preview since 2026-11-09, owner request): only ids and counts.
// Trainee message -> every admin's devices; admin message -> the trainee's
// devices. 404/410 means the subscription is dead and is dropped.
export const sendChatPush = async (
  {
    senderRole,
    traineeUserId,
    conversationId,
    senderAdminId,
    body,
    sticker,
    photo,
  }: SendChatPushInput,
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
    // The title names the sender the way each RECIPIENT calls them: their own
    // private nickname when they set one, else the real name. Nobody else's
    // nickname is ever used, so the devices are grouped by that name.
    const senderKeys =
      recipientRole === "admin"
        ? [userActorKey(traineeUserId)]
        : [
            ...(senderAdminId != null ? [adminActorKey(senderAdminId)] : []),
            PT_ALIAS_TARGET,
          ];
    const aliasesByOwner = await loadAliasesForOwners(
      targets.map((target) => target.ownerKey),
      senderKeys,
    );
    let realName: string | null = null;

    if (recipientRole === "admin") {
      const [trainee] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, traineeUserId));

      realName = trainee?.name ?? null;
    } else if (senderAdminId != null) {
      const [admin] = await db
        .select({ username: adminsTable.username })
        .from(adminsTable)
        .where(eq(adminsTable.id, senderAdminId));

      realName = admin?.username ?? null;
    }
    const groups = new Map<string, StoredSubscription[]>();

    for (const target of targets) {
      const aliases = aliasesByOwner.get(target.ownerKey);
      const alias = senderKeys
        .map((key) => aliases?.get(key)?.trim())
        .find(Boolean);
      const group = alias ?? "";

      groups.set(group, [...(groups.get(group) ?? []), target]);
    }
    await Promise.all(
      [...groups].map(([alias, group]) =>
        deliverLocalized(
          group,
          (locale) =>
            buildChatPushPayload({
              recipientRole,
              senderName:
                alias ||
                realName ||
                (recipientRole === "admin"
                  ? getPushTranslator(locale)("traineeFallback")
                  : "PT"),
              traineeUserId,
              conversationId,
              body,
              sticker,
              photo,
              locale,
            }),
          vapid,
          sender,
        ),
      ),
    );
  } catch (error) {
    logServerError("sendChatPush", error, { conversationId });
  }
};

export interface SendReactionPushInput {
  // The author of the reacted message, the only person who is notified.
  recipient:
    { role: "user"; userId: number } | { role: "admin"; adminId: number };
  reactorName: string;
  // The reactor's account key ("user:<id>" / "admin:<id>"): the recipient's
  // own nickname for them, if any, replaces `reactorName`.
  reactorKey?: string;
  emoji: string;
  traineeUserId: number;
  conversationId: number;
}

// Never throws; the payload carries the reactor, the emoji and a link, never
// the message text. The caller has already ruled out self-reactions.
export const sendReactionPush = async (
  {
    recipient,
    reactorName,
    reactorKey,
    emoji,
    traineeUserId,
    conversationId,
  }: SendReactionPushInput,
  sender: PushSender = sendWithWebPush,
) => {
  try {
    const vapid = getVapid();

    if (!vapid) {
      return;
    }
    if (
      recipient.role === "admin" &&
      ((await isUserHidden(recipient.adminId, traineeUserId)) ||
        !(await isUserInAdminScope(recipient.adminId, traineeUserId)))
    ) {
      return;
    }
    const targets = await db
      .select()
      .from(pushSubscriptions)
      .where(
        eq(
          pushSubscriptions.ownerKey,
          recipient.role === "user"
            ? userOwnerKey(recipient.userId)
            : adminOwnerKey(recipient.adminId),
        ),
      );

    if (targets.length === 0) {
      return;
    }
    // The recipient's private nickname for the reactor (a trainee also has
    // one for the whole PT side), never anybody else's.
    const recipientKey =
      recipient.role === "user"
        ? userActorKey(recipient.userId)
        : adminActorKey(recipient.adminId);
    const aliasKeys = reactorKey
      ? [
          reactorKey,
          ...(recipient.role === "user" && reactorKey.startsWith("admin:")
            ? [PT_ALIAS_TARGET]
            : []),
        ]
      : [];
    const aliases = await loadAliases(recipientKey, aliasKeys);
    const shownName =
      aliasKeys.map((key) => aliases.get(key)?.trim()).find(Boolean) ??
      reactorName;

    await deliverLocalized(
      targets,
      (locale) =>
        buildReactionPushPayload({
          recipientRole: recipient.role,
          reactorName: shownName,
          emoji,
          traineeUserId,
          conversationId,
          locale,
        }),
      vapid,
      sender,
    );
  } catch (error) {
    logServerError("sendReactionPush", error, { conversationId });
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

export const scheduleReactionPush = (input: SendReactionPushInput) => {
  try {
    after(() => sendReactionPush(input));
  } catch {
    void sendReactionPush(input);
  }
};
