import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { pushSubscriptions, users } from "@/db/schema";

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
type Input = Parameters<typeof push.sendReactionPush>[0];

let db: TestDb;
let traineeId: number;

const addSub = (ownerKey: string, name: string) =>
  db.insert(pushSubscriptions).values({
    ownerKey,
    endpoint: `https://push.example/${name}`,
    p256dh: "p",
    auth: "a",
  });

const input = (recipient: Input["recipient"]): Input => ({
  recipient,
  reactorName: "Hoan",
  emoji: "❤️",
  traineeUserId: traineeId,
  conversationId: 3,
});

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

describe("sendReactionPush", () => {
  it("sends once to the author's devices only, with no message text", async () => {
    await addSub(`user:${traineeId}`, "t1");
    await addSub("admin:1", "a1");
    await addSub("admin:2", "a2");
    const sender = vi.fn<Sender>(async () => undefined);

    await push.sendReactionPush(input({ role: "admin", adminId: 2 }), sender);

    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender.mock.calls[0][0].endpoint).toBe("https://push.example/a2");
    expect(sender.mock.calls[0][1]).toEqual({
      title: "PT App",
      body: "Hoan đã thả ❤️ vào tin nhắn của bạn",
      url: `/admin/users/${traineeId}/messages`,
      tag: "chat-react-3",
    });
  });

  it("links a trainee author to the messages tab", async () => {
    await addSub(`user:${traineeId}`, "t1");
    const sender = vi.fn<Sender>(async () => undefined);

    await push.sendReactionPush(
      input({ role: "user", userId: traineeId }),
      sender,
    );

    expect(sender.mock.calls[0][1].url).toBe("/messages");
  });

  it("drops a dead subscription and does not throw", async () => {
    await addSub(`user:${traineeId}`, "gone");

    await push.sendReactionPush(
      input({ role: "user", userId: traineeId }),
      async () => {
        throw Object.assign(new Error("gone"), { statusCode: 410 });
      },
    );

    expect(await db.select().from(pushSubscriptions)).toEqual([]);
  });

  it("sends nothing when the author has no subscription", async () => {
    const sender = vi.fn<Sender>(async () => undefined);

    await push.sendReactionPush(input({ role: "admin", adminId: 9 }), sender);

    expect(sender).not.toHaveBeenCalled();
  });
});
