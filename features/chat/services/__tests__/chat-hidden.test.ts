import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  adminHiddenUsers,
  admins,
  loginAttempts,
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

const hidden = await import("@/features/chat/services/chat-hidden");
const q = await import("@/features/chat/services/chat-queries");
const push = await import("@/features/chat/services/chat-push");
const { hashPassword } = await import("@/services/password");

let db: TestDb;
let seq = 0;
// Admin A has the passcode 1234; admin B has none until a test sets one.
const A = 1;
const B = 2;

const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const addTrainee = async (name: string) => {
  const [row] = await db
    .insert(users)
    .values({ name, nameKey: name.toLowerCase(), chatEnabled: true })
    .returning({ id: users.id });
  const conversation = await q.getOrCreateConversation(row.id);

  return { userId: row.id, conversationId: conversation.id };
};

const fromTrainee = (conversationId: number, body = "hi") =>
  q.insertMessage({
    conversationId,
    senderRole: "user",
    senderAdminId: null,
    body,
    clientId: uuid(),
  });

const inboxIds = async (adminId: number) =>
  (await q.listAdminInbox(adminId)).conversations.map((c) => c.conversationId);

const setPasscode = async (adminId: number, code: string) => {
  await db
    .update(admins)
    .set({ passcodeHash: await hashPassword(code) })
    .where(eq(admins.id, adminId));
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  seq = 0;
  await db.insert(admins).values([
    { username: "pt-one", usernameKey: "pt-one", passwordHash: "x" },
    { username: "pt-two", usernameKey: "pt-two", passwordHash: "x" },
  ]);
  await setPasscode(A, "1234");
});

describe("hideConversations", () => {
  it("refuses an admin without a passcode and stores nothing", async () => {
    const t = await addTrainee("An");
    const result = await hidden.hideConversations(B, [t.conversationId]);

    expect(result).toEqual({
      status: "error",
      message: "Hãy đặt mã khoá trước khi ẩn học viên.",
    });
    expect(await db.select().from(adminHiddenUsers)).toHaveLength(0);
  });

  it("hides many at once, ignores unknown ids and repeats", async () => {
    const t1 = await addTrainee("An");
    const t2 = await addTrainee("Binh");

    const first = await hidden.hideConversations(A, [
      t1.conversationId,
      t2.conversationId,
      t1.conversationId,
      9999,
    ]);
    const again = await hidden.hideConversations(A, [t1.conversationId]);

    expect(first).toEqual({ status: "success", hidden: 2 });
    expect(again).toEqual({ status: "success", hidden: 1 });
    const rows = await db.select().from(adminHiddenUsers);

    expect(rows.map((r) => [r.adminId, r.userId]).sort()).toEqual([
      [A, t1.userId],
      [A, t2.userId],
    ]);
  });

  it("hides trainees by id, with or without a conversation, ignoring unknown ids", async () => {
    const t = await addTrainee("An");
    const [fresh] = await db
      .insert(users)
      .values({ name: "Cuc", nameKey: "cuc", chatEnabled: true })
      .returning({ id: users.id });

    expect(await hidden.hideUsers(B, [t.userId])).toMatchObject({
      status: "error",
    });
    expect(await hidden.hideUsers(A, [t.userId, fresh.id, 9999])).toEqual({
      status: "success",
      hidden: 2,
    });
    expect(await hidden.hideUsers(A, [t.userId])).toEqual({
      status: "success",
      hidden: 1,
    });
    expect(await db.select().from(adminHiddenUsers)).toHaveLength(2);

    await hidden.unhideUser(A, fresh.id);
    expect(
      (await db.select().from(adminHiddenUsers)).map((r) => r.userId),
    ).toEqual([t.userId]);
  });

  it("reports whether the current conversation is hidden, per admin", async () => {
    const t = await addTrainee("An");

    await hidden.hideConversations(A, [t.conversationId]);

    expect(await hidden.isConversationHidden(A, t.conversationId)).toBe(true);
    expect(await hidden.isConversationHidden(B, t.conversationId)).toBe(false);
  });
});

describe("hidden conversations in the admin inbox and unread", () => {
  it("leaves them out for the hiding admin only, even on new messages", async () => {
    const shown = await addTrainee("An");
    const secret = await addTrainee("Binh");

    await fromTrainee(shown.conversationId);
    await fromTrainee(secret.conversationId);
    await hidden.hideConversations(A, [secret.conversationId]);
    await fromTrainee(secret.conversationId, "again");

    expect(await inboxIds(A)).toEqual([shown.conversationId]);
    expect((await inboxIds(B)).sort()).toEqual(
      [shown.conversationId, secret.conversationId].sort(),
    );
    expect(await q.countUnreadForAdmin(A)).toBe(1);
    expect(await q.countUnreadForAdmin(B)).toBe(3);
    expect(
      (await q.listUnreadByTraineeForAdmin(A)).map((r) => r.conversationId),
    ).toEqual([shown.conversationId]);
    expect(
      (await q.listUnreadByTraineeForAdmin(B)).map((r) => r.conversationId),
    ).toContain(secret.conversationId);
  });

  it("keeps trainees without a conversation in the inbox", async () => {
    const t = await addTrainee("An");
    const [fresh] = await db
      .insert(users)
      .values({ name: "Cuc", nameKey: "cuc", chatEnabled: true })
      .returning({ id: users.id });

    await hidden.hideConversations(A, [t.conversationId]);

    const inbox = await q.listAdminInbox(A);

    expect(inbox.conversations).toEqual([]);
    expect(inbox.withoutConversation.map((r) => r.userId)).toEqual([fresh.id]);
  });

  it("leaves a hidden trainee without a conversation out of the inbox for that admin only", async () => {
    const [fresh] = await db
      .insert(users)
      .values({ name: "Cuc", nameKey: "cuc", chatEnabled: true })
      .returning({ id: users.id });

    await hidden.hideUsers(A, [fresh.id]);

    expect((await q.listAdminInbox(A)).withoutConversation).toEqual([]);
    expect(
      (await q.listAdminInbox(B)).withoutConversation.map((r) => r.userId),
    ).toEqual([fresh.id]);
  });

  it("restores the chat after unhide", async () => {
    const t = await addTrainee("An");

    await fromTrainee(t.conversationId);
    await hidden.hideConversations(A, [t.conversationId]);
    expect(await inboxIds(A)).toEqual([]);

    await hidden.unhideConversation(A, t.conversationId);

    expect(await inboxIds(A)).toEqual([t.conversationId]);
    expect(await q.countUnreadForAdmin(A)).toBe(1);
  });
});

describe("revealHiddenUsers", () => {
  it("returns only this admin's hidden chats, newest first, on the right code", async () => {
    const old = await addTrainee("An");
    const recent = await addTrainee("Binh");
    const others = await addTrainee("Cuc");

    await setPasscode(B, "5678");
    await fromTrainee(old.conversationId, "old");
    await fromTrainee(recent.conversationId, "new");
    await hidden.hideConversations(A, [
      old.conversationId,
      recent.conversationId,
    ]);
    await hidden.hideConversations(B, [others.conversationId]);

    const result = await hidden.revealHiddenUsers(A, "1234");

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.conversations.map((c) => c.conversationId)).toEqual([
      recent.conversationId,
      old.conversationId,
    ]);
    expect(result.conversations[0]).toMatchObject({
      userName: "Binh",
      preview: "new",
      unread: 1,
    });
    expect(result.users.map((u) => u.userName)).toEqual(["An", "Binh"]);
  });

  it("also lists a hidden trainee without a conversation", async () => {
    const [fresh] = await db
      .insert(users)
      .values({ name: "Cuc", nameKey: "cuc", chatEnabled: true })
      .returning({ id: users.id });

    await hidden.hideUsers(A, [fresh.id]);

    const result = await hidden.revealHiddenUsers(A, "1234");

    expect(result).toMatchObject({
      status: "success",
      conversations: [],
      users: [{ userId: fresh.id, userName: "Cuc" }],
      withoutConversation: [{ userId: fresh.id }],
    });
  });

  it("answers a generic no-match to a wrong code, never the chats", async () => {
    const t = await addTrainee("An");

    await hidden.hideConversations(A, [t.conversationId]);

    expect(await hidden.revealHiddenUsers(A, "0000")).toEqual({
      status: "error",
      message: "Không khớp",
    });
    expect(await hidden.revealHiddenUsers(B, "1234")).toEqual({
      status: "error",
      message: "Không khớp",
    });
  });

  it("rate limits after 5 wrong codes, even for the right one, on its own key", async () => {
    const t = await addTrainee("An");

    await hidden.hideConversations(A, [t.conversationId]);
    for (let i = 0; i < 5; i += 1) {
      await hidden.revealHiddenUsers(A, "0000");
    }

    expect(await hidden.revealHiddenUsers(A, "1234")).toEqual({
      status: "error",
      message: "Không khớp",
    });
    const [attempt] = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.key, `passcode-reveal:${A}`));

    expect(attempt.failedCount).toBe(5);
    expect(attempt.lockedUntil).not.toBeNull();
    // The lock screen's own 5-strike counter is untouched.
    const [admin] = await db.select().from(admins).where(eq(admins.id, A));

    expect(admin.passcodeFailedCount).toBe(0);
  });

  it("clears the failures after a right code", async () => {
    await hidden.revealHiddenUsers(A, "0000");
    await hidden.revealHiddenUsers(A, "1234");

    expect(await db.select().from(loginAttempts)).toHaveLength(0);
  });
});

describe("push to an admin who hid the trainee", () => {
  const addSub = (ownerKey: string, name: string) =>
    db.insert(pushSubscriptions).values({
      ownerKey,
      endpoint: `https://push.example/${name}`,
      p256dh: "p",
      auth: "a",
    });

  beforeEach(() => {
    push.resetChatPushForTests();
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    vi.stubEnv("VAPID_SUBJECT", "mailto:pt@example.com");
  });

  it("skips the trainee-message push for that admin only", async () => {
    const t = await addTrainee("An");
    const other = await addTrainee("Binh");
    const sender = vi.fn<
      import("@/features/chat/services/chat-push").PushSender
    >(async () => undefined);

    await addSub(`admin:${A}`, "a");
    await addSub(`admin:${B}`, "b");
    await hidden.hideConversations(A, [t.conversationId]);

    await push.sendChatPush(
      {
        senderRole: "user",
        traineeUserId: t.userId,
        conversationId: t.conversationId,
      },
      sender,
    );
    expect(sender.mock.calls.map(([sub]) => sub.endpoint)).toEqual([
      "https://push.example/b",
    ]);

    sender.mockClear();
    await push.sendChatPush(
      {
        senderRole: "user",
        traineeUserId: other.userId,
        conversationId: other.conversationId,
      },
      sender,
    );
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it("skips the push for a trainee hidden by id", async () => {
    const t = await addTrainee("An");
    const sender = vi.fn<
      import("@/features/chat/services/chat-push").PushSender
    >(async () => undefined);

    await addSub(`admin:${A}`, "a");
    await hidden.hideUsers(A, [t.userId]);
    await push.sendChatPush(
      {
        senderRole: "user",
        traineeUserId: t.userId,
        conversationId: t.conversationId,
      },
      sender,
    );
    expect(sender).not.toHaveBeenCalled();
  });

  it("skips the reaction push to an admin who hid the chat", async () => {
    const t = await addTrainee("An");
    const sender = vi.fn<
      import("@/features/chat/services/chat-push").PushSender
    >(async () => undefined);
    const input = (adminId: number) => ({
      recipient: { role: "admin" as const, adminId },
      reactorName: "An",
      emoji: "👍",
      traineeUserId: t.userId,
      conversationId: t.conversationId,
    });

    await addSub(`admin:${A}`, "a");
    await addSub(`admin:${B}`, "b");
    await hidden.hideConversations(A, [t.conversationId]);

    await push.sendReactionPush(input(A), sender);
    expect(sender).not.toHaveBeenCalled();

    await push.sendReactionPush(input(B), sender);
    expect(sender).toHaveBeenCalledTimes(1);
  });
});
