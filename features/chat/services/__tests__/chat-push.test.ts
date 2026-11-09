import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  adminHiddenUsers,
  admins,
  chatNicknames,
  pushSubscriptions,
  users,
} from "@/db/schema";

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

  it("sends a trainee message to every admin, titled with the name and showing the text", async () => {
    await addSub("admin:1", "a1");
    await addSub("admin:2", "a2");
    await addSub(`user:${traineeId}`, "trainee");
    const sender = vi.fn<
      import("@/features/chat/services/chat-push").PushSender
    >(async () => undefined);

    await push.sendChatPush(
      {
        senderRole: "user",
        traineeUserId: traineeId,
        conversationId: 3,
        body: "Em tập xong rồi\nạ",
      },
      sender,
    );

    expect(sender.mock.calls.map(([sub]) => sub.endpoint).sort()).toEqual([
      "https://push.example/a1",
      "https://push.example/a2",
    ]);
    expect(sender.mock.calls[0][1]).toEqual({
      title: "Lan",
      body: "Em tập xong rồi\nạ",
      url: `/admin/users/${traineeId}/messages`,
      tag: "chat-3",
    });
  });

  it("titles an admin message with the admin's username", async () => {
    const [admin] = await db
      .insert(admins)
      .values({
        username: "Hoan",
        usernameKey: "hoan",
        passwordHash: "x",
        role: "super_admin",
      })
      .returning({ id: admins.id, username: admins.username });

    await addSub(`user:${traineeId}`, "t");
    const sender = vi.fn<
      import("@/features/chat/services/chat-push").PushSender
    >(async () => undefined);

    await push.sendChatPush(
      {
        senderRole: "admin",
        senderAdminId: admin.id,
        traineeUserId: traineeId,
        conversationId: 3,
        body: "Mai tập ngực",
      },
      sender,
    );

    expect(sender.mock.calls[0][1].title).toBe(admin.username);
    expect(sender.mock.calls[0][1].body).toBe("Mai tập ngực");
  });

  it("titles pushes with the conversation nicknames when set", async () => {
    const [admin] = await db
      .insert(admins)
      .values({
        username: "Hoan",
        usernameKey: "hoan-nick",
        passwordHash: "x",
        role: "super_admin",
      })
      .returning({ id: admins.id });
    const nickRow = (targetKey: string, nickname: string) => ({
      conversationId: 3,
      targetKey,
      nickname,
      setByKey: "user",
      updatedAt: new Date(),
    });

    await db
      .insert(chatNicknames)
      .values([nickRow("user", "Lan béo"), nickRow("pt", "Thầy")]);
    await addSub(`user:${traineeId}`, "t");
    await addSub(`admin:${admin.id}`, "a");
    const sender = vi.fn<
      import("@/features/chat/services/chat-push").PushSender
    >(async () => undefined);

    await push.sendChatPush(
      {
        senderRole: "user",
        traineeUserId: traineeId,
        conversationId: 3,
        body: "hi",
      },
      sender,
    );
    await push.sendChatPush(
      {
        senderRole: "admin",
        senderAdminId: admin.id,
        traineeUserId: traineeId,
        conversationId: 3,
        body: "hi",
      },
      sender,
    );
    expect(sender.mock.calls.map((call) => call[1].title)).toEqual([
      "Lan béo",
      "Thầy",
    ]);

    await db
      .insert(chatNicknames)
      .values(nickRow(`admin:${admin.id}`, "Coach Hoan"));
    await push.sendChatPush(
      {
        senderRole: "admin",
        senderAdminId: admin.id,
        traineeUserId: traineeId,
        conversationId: 3,
        body: "hi",
      },
      sender,
    );
    expect(sender.mock.calls[2][1].title).toBe("Coach Hoan");
  });

  it("ignores nicknames of another conversation", async () => {
    await db.insert(chatNicknames).values({
      conversationId: 99,
      targetKey: "user",
      nickname: "Other",
      setByKey: "user",
      updatedAt: new Date(),
    });
    await addSub("admin:1", "a1");
    const sender = vi.fn<
      import("@/features/chat/services/chat-push").PushSender
    >(async () => undefined);

    await push.sendChatPush(
      { senderRole: "user", traineeUserId: traineeId, conversationId: 3 },
      sender,
    );
    expect(sender.mock.calls[0][1].title).toBe("Lan");
  });

  it('titles an admin message "PT" when the sender is unknown', async () => {
    await addSub(`user:${traineeId}`, "t");
    const sender = vi.fn<
      import("@/features/chat/services/chat-push").PushSender
    >(async () => undefined);

    await push.sendChatPush(
      {
        senderRole: "admin",
        traineeUserId: traineeId,
        conversationId: 3,
        body: "hi",
      },
      sender,
    );

    expect(sender.mock.calls[0][1].title).toBe("PT");
  });

  it("announces a photo as 'Đã gửi ảnh' and skips the admin who hid the trainee", async () => {
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
    expect(sender.mock.calls[0][1].body).toBe("Đã gửi ảnh");
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

describe("P1 workspace scope of trainee message pushes", () => {
  const addAdmin = async (name: string, role: "pt" | "super_admin" | null) => {
    const [row] = await db
      .insert(admins)
      .values({ username: name, usernameKey: name, passwordHash: "x", role })
      .returning({ id: admins.id });

    return row.id;
  };

  const sendFromTrainee = async () => {
    const sender = vi.fn<
      import("@/features/chat/services/chat-push").PushSender
    >(async () => undefined);

    await push.sendChatPush(
      {
        senderRole: "user",
        traineeUserId: traineeId,
        conversationId: 3,
        body: "Em tập xong rồi\nạ",
      },
      sender,
    );
    return sender.mock.calls
      .map(([sub]) => sub.endpoint.split("/").pop())
      .sort();
  };

  it("notifies super admins and the trainee's own PT, not other PTs", async () => {
    const superId = await addAdmin("boss", "super_admin");
    const legacyId = await addAdmin("legacy", null);
    const ownPt = await addAdmin("own", "pt");
    const otherPt = await addAdmin("other", "pt");

    await db
      .update(users)
      .set({ ptAdminId: ownPt })
      .where(eq(users.id, traineeId));
    await addSub(`admin:${superId}`, "super");
    await addSub(`admin:${legacyId}`, "legacy");
    await addSub(`admin:${ownPt}`, "own");
    await addSub(`admin:${otherPt}`, "other");

    expect(await sendFromTrainee()).toEqual(["legacy", "own", "super"]);
  });

  it("sends a trainee without a PT to super admins only", async () => {
    const superId = await addAdmin("boss", "super_admin");
    const pt = await addAdmin("pt", "pt");

    await addSub(`admin:${superId}`, "super");
    await addSub(`admin:${pt}`, "pt");

    expect(await sendFromTrainee()).toEqual(["super"]);
  });

  it("still drops an admin who hid the trainee, even the own PT", async () => {
    const ownPt = await addAdmin("own", "pt");

    await db
      .update(users)
      .set({ ptAdminId: ownPt })
      .where(eq(users.id, traineeId));
    await addSub(`admin:${ownPt}`, "own");
    await db
      .insert(adminHiddenUsers)
      .values({ adminId: ownPt, userId: traineeId });

    expect(await sendFromTrainee()).toEqual([]);
  });
});
