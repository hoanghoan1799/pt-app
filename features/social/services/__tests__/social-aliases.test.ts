import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  admins,
  contactAliases,
  dmConversations,
  dmMessages,
  pushSubscriptions,
  socialPosts,
  users,
} from "@/db/schema";
import { TERMS_VERSION } from "@/features/social/constants/social";
import type { SocialActor } from "@/features/social/types/social";

// Private nicknames across the social features: the viewer's own nickname
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

const accountLookup = await import("@/features/social/services/account-lookup");
const queries = await import("@/features/social/services/engagement-queries");
const mutations =
  await import("@/features/social/services/engagement-mutations");
const postQueries = await import("@/features/social/services/post-queries");
const profileQueries =
  await import("@/features/social/services/profile-queries");
const friendQueries = await import("@/features/social/services/friend-queries");
const dmQueries = await import("@/features/social/services/dm-queries");
const notifications =
  await import("@/features/social/services/social-notifications");
const dmNotify = await import("@/features/social/services/dm-notify");
const chatPush = await import("@/features/chat/services/chat-push");

type Sender = import("@/features/chat/services/chat-push").PushSender;

let db: TestDb;
let root: number;
let alice: number;
let bob: number;
let carol: number;

const asUser = (id: number) => ({ kind: "user", id }) satisfies SocialActor;

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

const post = async (authorKind: "user" | "admin", authorId: number) =>
  (
    await db
      .insert(socialPosts)
      .values({
        authorKind,
        authorId,
        privacy: "everyone",
        caption: "x",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: socialPosts.id })
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

describe("loadAccounts with a viewer", () => {
  const keys = () => [`user:${alice}`, `user:${bob}`, `admin:${root}`];

  it("overlays the viewer's nicknames and keeps the real name available", async () => {
    const accounts = await accountLookup.loadAccounts(keys(), `user:${alice}`);

    expect(accounts.get(`user:${bob}`)).toMatchObject({
      name: "Bé Bin",
      realName: "bob",
    });
    expect(accounts.get(`admin:${root}`)).toMatchObject({
      name: "Thầy",
      realName: "root",
    });
  });

  it("never aliases the viewer themselves, even with a stray row", async () => {
    await alias(`user:${alice}`, `user:${alice}`, "Tự gọi");

    expect(
      (await accountLookup.loadAccounts(keys(), `user:${alice}`)).get(
        `user:${alice}`,
      )?.name,
    ).toBe("alice");
  });

  it("shows other viewers, and the named people, the real names", async () => {
    for (const viewer of [`user:${carol}`, `user:${bob}`, `admin:${root}`]) {
      const accounts = await accountLookup.loadAccounts(keys(), viewer);

      expect(accounts.get(`user:${bob}`)?.name).toBe("bob");
      expect(accounts.get(`admin:${root}`)?.name).toBe("root");
      expect(accounts.get(`user:${alice}`)?.name).toBe("alice");
    }
  });

  it("is the plain real names without a viewer", async () => {
    const accounts = await accountLookup.loadAccounts(keys());

    expect(accounts.get(`user:${bob}`)).toMatchObject({
      name: "bob",
      realName: "bob",
    });
  });

  it("leaves deleted accounts out", async () => {
    const accounts = await accountLookup.loadAccounts(
      ["user:9999", `user:${bob}`],
      `user:${alice}`,
    );

    expect([...accounts.keys()]).toEqual([`user:${bob}`]);
  });
});

describe("post authors, comments and reactors", () => {
  it("names authors by the viewer's nickname only for that viewer", async () => {
    const bobsPost = await post("user", bob);
    const rootsPost = await post("admin", root);
    const alicesPost = await post("user", alice);

    const names = async (viewer: SocialActor) => [
      (await postQueries.getPostView(viewer, bobsPost))?.authorName,
      (await postQueries.getPostView(viewer, rootsPost))?.authorName,
      (await postQueries.getPostView(viewer, alicesPost))?.authorName,
    ];

    expect(await names(asUser(alice))).toEqual(["Bé Bin", "Thầy", "alice"]);
    expect(await names(asUser(carol))).toEqual(["bob", "root", "alice"]);
    expect(await names(asUser(bob))).toEqual(["bob", "root", "alice"]);
    expect(
      await names({ kind: "admin", id: root, role: "super_admin" }),
    ).toEqual(["bob", "root", "alice"]);
  });

  it("names commenters and reactors by the viewer's nickname", async () => {
    const target = await post("user", carol);

    await mutations.addComment(asUser(bob), target, "hi", new Date(1000));
    await mutations.reactToPost(asUser(bob), target, "❤️");
    await mutations.reactToPost(asUser(alice), target, "💪");

    const comments = async (viewer: SocialActor) =>
      (await queries.listComments(viewer, target, "user"))?.map(
        (item) => item.authorName,
      );
    const reactors = async (viewer: SocialActor) =>
      (await queries.listReactors(viewer, target))?.map((item) => item.name);

    expect(await comments(asUser(alice))).toEqual(["Bé Bin"]);
    expect(await comments(asUser(carol))).toEqual(["bob"]);
    expect(await reactors(asUser(alice))).toEqual(["Bé Bin", "alice"]);
    expect(await reactors(asUser(carol))).toEqual(["bob", "alice"]);
  });
});

describe("notifications", () => {
  it("names the actor by the recipient's own nickname", async () => {
    await notifications.createNotification({
      recipientKey: `user:${alice}`,
      kind: "post_comment",
      actorKey: `user:${bob}`,
      postId: 1,
    });
    await notifications.createNotification({
      recipientKey: `user:${carol}`,
      kind: "post_comment",
      actorKey: `user:${bob}`,
      postId: 1,
    });

    const forAlice = await notifications.listNotifications(`user:${alice}`);
    const forCarol = await notifications.listNotifications(`user:${carol}`);

    expect(forAlice[0]).toMatchObject({
      actorName: "Bé Bin",
      text: "Bé Bin đã bình luận về bài viết của bạn",
    });
    expect(forCarol[0]).toMatchObject({ actorName: "bob" });
  });

  it("puts the recipient's nickname for the actor in the push title text", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    vi.stubEnv("VAPID_SUBJECT", "mailto:pt@example.com");
    chatPush.resetChatPushForTests();
    const sender = vi.fn<Sender>(async () => undefined);
    const mine = await post("user", alice);
    const others = await post("user", carol);

    for (const owner of [alice, carol]) {
      await db.insert(pushSubscriptions).values({
        ownerKey: `user:${owner}`,
        endpoint: `https://push.example/${owner}`,
        p256dh: "p",
        auth: "a",
      });
    }
    const first = await mutations.addComment(asUser(bob), mine, "chào");
    const second = await mutations.addComment(asUser(bob), others, "chào");

    await notifications.sendSocialPush(
      {
        notificationId: (first as { notificationId: number }).notificationId,
        commentBody: "chào",
      },
      sender,
    );
    await notifications.sendSocialPush(
      {
        notificationId: (second as { notificationId: number }).notificationId,
        commentBody: "chào",
      },
      sender,
    );

    const bodies = Object.fromEntries(
      sender.mock.calls.map((call) => [
        call[0].endpoint,
        JSON.stringify(call[1]),
      ]),
    );

    expect(bodies[`https://push.example/${alice}`]).toContain("Bé Bin");
    expect(bodies[`https://push.example/${alice}`]).not.toContain("bob");
    expect(bodies[`https://push.example/${carol}`]).toContain("bob");
    expect(bodies[`https://push.example/${carol}`]).not.toContain("Bé Bin");
  });
});

describe("profiles and people lists", () => {
  it("shows the alias with the real name on the viewer's profile page only", async () => {
    expect(
      await profileQueries.getProfile("user", bob, `user:${alice}`),
    ).toMatchObject({ name: "Bé Bin", realName: "bob", alias: "Bé Bin" });
    expect(
      await profileQueries.getProfile("admin", root, `user:${alice}`),
    ).toMatchObject({ name: "Thầy", realName: "root", alias: "Thầy" });
    expect(
      await profileQueries.getProfile("user", bob, `user:${carol}`),
    ).toMatchObject({ name: "bob", realName: "bob", alias: "" });
    expect(await profileQueries.getProfile("user", bob)).toMatchObject({
      name: "bob",
      alias: "",
    });
    expect(
      await profileQueries.getProfile("user", 9999, `user:${alice}`),
    ).toBeNull();
  });

  it("never aliases someone's own profile", async () => {
    await alias(`user:${alice}`, `user:${alice}`, "Tự gọi");

    expect(
      await profileQueries.getProfile("user", alice, `user:${alice}`),
    ).toMatchObject({ name: "alice", alias: "" });
  });

  it("names people in friend lists by the viewer's nickname", async () => {
    const forAlice = await friendQueries.loadPeople([bob, carol], alice);
    const forBob = await friendQueries.loadPeople([alice, carol], bob);

    expect(forAlice.get(bob)?.name).toBe("Bé Bin");
    expect(forAlice.get(carol)?.name).toBe("carol");
    expect(forBob.get(alice)?.name).toBe("alice");
    expect((await friendQueries.loadPeople([bob])).get(bob)?.name).toBe("bob");
  });
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
