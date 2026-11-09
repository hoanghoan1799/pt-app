import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { admins, pushSubscriptions, users } from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ default: { sendNotification: vi.fn() } }));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const push = await import("@/features/chat/services/chat-push");

type Sender = import("@/features/chat/services/chat-push").PushSender;

let db: TestDb;
let traineeId: number;

const addSub = (ownerKey: string, name: string) =>
  db.insert(pushSubscriptions).values({
    ownerKey,
    endpoint: `https://push.example/${name}`,
    p256dh: "p",
    auth: "a",
  });

const addAdmin = async (key: string, locale: string | null) => {
  const [row] = await db
    .insert(admins)
    .values({
      username: key,
      usernameKey: key,
      passwordHash: "x",
      role: "super_admin",
      locale,
    })
    .returning({ id: admins.id });

  return row.id;
};

const bodyBy = (sender: ReturnType<typeof vi.fn<Sender>>) =>
  Object.fromEntries(
    sender.mock.calls.map(([sub, payload]) => [
      sub.endpoint.replace("https://push.example/", ""),
      payload.body,
    ]),
  );

beforeEach(async () => {
  vi.restoreAllMocks();
  db = await createTestDb();
  state.db = db;
  push.resetChatPushForTests();
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  vi.stubEnv("VAPID_SUBJECT", "mailto:pt@example.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
  const [row] = await db
    .insert(users)
    .values({ name: "Lan", nameKey: "lan" })
    .returning({ id: users.id });

  traineeId = row.id;
});

describe("push text follows the recipient's language", () => {
  it("sends each admin their own language for a trainee photo", async () => {
    const english = await addAdmin("en-admin", "en");
    const vietnamese = await addAdmin("vi-admin", "vi");
    const unset = await addAdmin("unset-admin", null);

    await addSub(`admin:${english}`, "en");
    await addSub(`admin:${vietnamese}`, "vi");
    await addSub(`admin:${unset}`, "unset");
    const sender = vi.fn<Sender>(async () => undefined);

    await push.sendChatPush(
      {
        senderRole: "user",
        traineeUserId: traineeId,
        conversationId: 3,
        photo: true,
      },
      sender,
    );

    expect(bodyBy(sender)).toEqual({
      en: "Sent a photo",
      vi: "Đã gửi ảnh",
      unset: "Đã gửi ảnh",
    });
  });

  it("uses the trainee's stored language for an admin message", async () => {
    await db.update(users).set({ locale: "en" }).where(eq(users.id, traineeId));
    await addSub(`user:${traineeId}`, "t");
    const sender = vi.fn<Sender>(async () => undefined);

    await push.sendChatPush(
      {
        senderRole: "admin",
        traineeUserId: traineeId,
        conversationId: 3,
        sticker: true,
      },
      sender,
    );

    expect(bodyBy(sender)).toEqual({ t: "Sent a sticker" });
    expect(sender.mock.calls[0][1]).toMatchObject({
      title: "PT",
      tag: "chat-3",
    });
  });

  it("words a reaction push in the author's language", async () => {
    await db.update(users).set({ locale: "en" }).where(eq(users.id, traineeId));
    await addSub(`user:${traineeId}`, "t");
    const sender = vi.fn<Sender>(async () => undefined);

    await push.sendReactionPush(
      {
        recipient: { role: "user", userId: traineeId },
        reactorName: "Hoan",
        emoji: "❤️",
        traineeUserId: traineeId,
        conversationId: 3,
      },
      sender,
    );

    expect(bodyBy(sender)).toEqual({ t: "Hoan reacted ❤️ to your message" });
  });
});
