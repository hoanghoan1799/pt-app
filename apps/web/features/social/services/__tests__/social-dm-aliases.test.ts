import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  admins,
  contactAliases,
  dmConversations,
  dmMessages,
  pushSubscriptions,
  users,
} from "@/db/schema";
import { TERMS_VERSION } from "@/features/social/constants/social";

// Private nicknames in direct messages (the rest moved to the API,
// social.services.test.ts and social-friends.e2e.test.ts): the viewer's own nickname
// replaces a name only for that viewer; the named person and everybody else
// keep seeing the real name.

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ default: { sendNotification: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn() }));
vi.mock("@/services/admin-lock", () => ({
  canSeeHiddenUsers: vi.fn(async () => false),
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const dmQueries = await import("@/features/social/services/dm-queries");
const dmNotify = await import("@/features/social/services/dm-notify");
const chatPush = await import("@/features/chat/services/chat-push");

type Sender = import("@/features/chat/services/chat-push").PushSender;

let db: TestDb;
let root: number;
let alice: number;
let bob: number;
let carol: number;

const alias = async (ownerKey: string, targetKey: string, value: string) => {
  await db
    .insert(contactAliases)
    .values({ ownerKey, targetKey, alias: value, updatedAt: new Date() });
};

const addUser = async (name: string) =>
  (
    await db
      .insert(users)
      .values({ name, nameKey: name, termsVersion: TERMS_VERSION })
      .returning({ id: users.id })
  )[0].id;

beforeEach(async () => {
  vi.restoreAllMocks();
  db = await createTestDb();
  state.db = db;
  root = (
    await db
      .insert(admins)
      .values({
        username: "root",
        usernameKey: "root",
        passwordHash: "x",
        role: "super_admin",
      })
      .returning({ id: admins.id })
  )[0].id;
  alice = await addUser("alice");
  bob = await addUser("bob");
  carol = await addUser("carol");
  // Alice calls Bob "Bé Bin" and the super admin "Thầy"; nobody else does.
  await alias(`user:${alice}`, `user:${bob}`, "Bé Bin");
  await alias(`user:${alice}`, `admin:${root}`, "Thầy");
});

describe("direct messages", () => {
  const seedConversation = async (a: number, b: number) => {
    const [low, high] = a < b ? [a, b] : [b, a];
    const [conversation] = await db
      .insert(dmConversations)
      .values({ userLow: low, userHigh: high, createdAt: new Date() })
      .returning({ id: dmConversations.id });
    const [message] = await db
      .insert(dmMessages)
      .values({
        conversationId: conversation.id,
        senderId: a,
        body: "hi",
        clientId: `c-${a}-${b}`,
        createdAt: new Date(),
      })
      .returning({ id: dmMessages.id });

    await db
      .update(dmConversations)
      .set({ lastMessageId: message.id, lastMessageAt: new Date() })
      .where(eq(dmConversations.id, conversation.id));
  };

  it("names the other person in the inbox by the viewer's nickname", async () => {
    await seedConversation(alice, bob);

    expect((await dmQueries.listDmInbox(alice))[0].name).toBe("Bé Bin");
    expect((await dmQueries.listDmInbox(bob))[0].name).toBe("alice");
  });

  it("titles a push with the recipient's nickname for the sender", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    vi.stubEnv("VAPID_SUBJECT", "mailto:pt@example.com");
    chatPush.resetChatPushForTests();
    const sender = vi.fn<Sender>(async () => undefined);

    for (const owner of [alice, carol]) {
      await db.insert(pushSubscriptions).values({
        ownerKey: `user:${owner}`,
        endpoint: `https://push.example/${owner}`,
        p256dh: "p",
        auth: "a",
      });
    }
    await dmNotify.sendDmPush(
      {
        senderId: bob,
        recipientId: alice,
        conversationId: 1,
        body: "yo",
        photo: false,
      },
      sender,
    );
    await dmNotify.sendDmPush(
      {
        senderId: bob,
        recipientId: carol,
        conversationId: 2,
        body: "yo",
        photo: false,
      },
      sender,
    );

    const titles = Object.fromEntries(
      sender.mock.calls.map((call) => [call[0].endpoint, call[1].title]),
    );

    expect(titles[`https://push.example/${alice}`]).toBe("Bé Bin");
    expect(titles[`https://push.example/${carol}`]).toBe("bob");
  });
});
