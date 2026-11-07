import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { adminHiddenUsers, pushSubscriptions, users } from "@/db/schema";

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

let db: TestDb;
let traineeId: number;

const addSub = async (ownerKey: string, name: string) => {
  await db.insert(pushSubscriptions).values({
    ownerKey,
    endpoint: `https://push.example/${name}`,
    p256dh: "p",
    auth: "a",
  });
};

const endpoints = async () =>
  (await db.select().from(pushSubscriptions))
    .map((row) => row.endpoint.replace("https://push.example/", ""))
    .sort();

const goneError = (statusCode: number) =>
  Object.assign(new Error("push failed"), { statusCode });

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

describe("sendChatPush", () => {
  it("drops a 410 subscription, keeps a 500 one, stamps the delivered one", async () => {
    await addSub(`user:${traineeId}`, "ok");
    await addSub(`user:${traineeId}`, "gone");
    await addSub(`user:${traineeId}`, "flaky");
    await addSub(`user:${traineeId + 1}`, "other-trainee");
    const sender = vi.fn(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("/gone")) {
        throw goneError(410);
      }
      if (sub.endpoint.endsWith("/flaky")) {
        throw goneError(500);
      }
    });

    await push.sendChatPush(
      { senderRole: "admin", traineeUserId: traineeId, conversationId: 3 },
      sender,
    );

    expect(sender).toHaveBeenCalledTimes(3);
    expect(await endpoints()).toEqual(["flaky", "ok", "other-trainee"]);
    const rows = await db.select().from(pushSubscriptions);
    const stamped = rows.filter((row) => row.lastSuccessAt !== null);

    expect(stamped.map((row) => row.endpoint)).toEqual([
      "https://push.example/ok",
    ]);
  });

  it("drops a 404 subscription too", async () => {
    await addSub(`user:${traineeId}`, "gone");

    await push.sendChatPush(
      { senderRole: "admin", traineeUserId: traineeId, conversationId: 3 },
      async () => {
        throw goneError(404);
      },
    );

    expect(await endpoints()).toEqual([]);
  });

  it("sends a trainee message to every admin, with name and no message body", async () => {
    await addSub("admin:1", "a1");
    await addSub("admin:2", "a2");
    await addSub(`user:${traineeId}`, "trainee");
    const sender = vi.fn<
      import("@/features/chat/services/chat-push").PushSender
    >(async () => undefined);

    await push.sendChatPush(
      { senderRole: "user", traineeUserId: traineeId, conversationId: 3 },
      sender,
    );

    expect(sender.mock.calls.map(([sub]) => sub.endpoint).sort()).toEqual([
      "https://push.example/a1",
      "https://push.example/a2",
    ]);
    expect(sender.mock.calls[0][1]).toEqual({
      title: "PT App",
      body: "Lan vừa nhắn tin",
      url: `/admin/users/${traineeId}/messages`,
      tag: "chat-3",
    });
  });

  it("announces a photo as '📷 Ảnh' and skips the admin who hid the trainee", async () => {
    await addSub("admin:1", "a1");
    await addSub("admin:2", "a2");
    await db.insert(adminHiddenUsers).values({ adminId: 1, userId: traineeId });
    const sender = vi.fn<
      import("@/features/chat/services/chat-push").PushSender
    >(async () => undefined);

    await push.sendChatPush(
      {
        senderRole: "user",
        traineeUserId: traineeId,
        conversationId: 3,
        photo: true,
      },
      sender,
    );

    expect(sender.mock.calls.map(([sub]) => sub.endpoint)).toEqual([
      "https://push.example/a2",
    ]);
    expect(sender.mock.calls[0][1].body).toBe("Lan: 📷 Ảnh");
  });

  it("sends nothing and warns once when VAPID is missing", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sender = vi.fn(async () => undefined);

    await addSub(`user:${traineeId}`, "ok");
    for (let i = 0; i < 2; i += 1) {
      await push.sendChatPush(
        { senderRole: "admin", traineeUserId: traineeId, conversationId: 3 },
        sender,
      );
    }

    expect(sender).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(await endpoints()).toEqual(["ok"]);
  });

  it("never throws, even when the database fails", async () => {
    state.db = {
      select: () => {
        throw new Error("db down");
      },
    };

    await expect(
      push.sendChatPush(
        { senderRole: "admin", traineeUserId: traineeId, conversationId: 3 },
        async () => undefined,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("subscriptions", () => {
  const sub = (endpoint: string) => ({
    endpoint,
    keys: { p256dh: "p2", auth: "a2" },
  });

  it("upserts on endpoint and reassigns the owner", async () => {
    await push.saveSubscription("user:1", sub("https://push.example/x"), "UA");
    await push.saveSubscription(
      "admin:5",
      sub("https://push.example/x"),
      "UA2",
    );

    const rows = await db.select().from(pushSubscriptions);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerKey: "admin:5",
      p256dh: "p2",
      auth: "a2",
      userAgent: "UA2",
    });
  });

  it("deletes only the owner's own subscription", async () => {
    await push.saveSubscription("user:1", sub("https://push.example/x"), "");

    await push.deleteSubscription("user:2", "https://push.example/x");
    expect(await db.select().from(pushSubscriptions)).toHaveLength(1);

    await push.deleteSubscription("user:1", "https://push.example/x");
    expect(
      await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.ownerKey, "user:1")),
    ).toHaveLength(0);
  });
});
