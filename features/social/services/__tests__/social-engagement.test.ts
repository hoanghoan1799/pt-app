import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  admins,
  pushSubscriptions,
  socialComments,
  socialNotifications,
  socialPosts,
  socialReactions,
  users,
} from "@/db/schema";
import { TERMS_VERSION } from "@/features/social/constants/social";
import type { SocialActor } from "@/features/social/types/social";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as unknown,
  admin: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ default: { sendNotification: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn() }));
vi.mock("@/services/admin-lock", () => ({
  canSeeHiddenUsers: vi.fn(async () => false),
}));
vi.mock("@/services/auth-guard", () => ({
  requireUser: vi.fn(async () => state.user),
  requireAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const actions = await import("@/features/social/services/engagement-actions");
const mutations =
  await import("@/features/social/services/engagement-mutations");
const queries = await import("@/features/social/services/engagement-queries");
const postQueries = await import("@/features/social/services/post-queries");
const postMutations = await import("@/features/social/services/post-mutations");
const notifications =
  await import("@/features/social/services/social-notifications");
const cleanup = await import("@/features/social/services/post-cleanup");
const push = await import("@/features/chat/services/chat-push");

type Sender = import("@/features/chat/services/chat-push").PushSender;

let db: TestDb;
let superId: number;
let ptA: number;
let ptB: number;
let alice: number; // PT A's trainee
let bob: number; // PT B's trainee
let carol: number; // no PT

const asUser = (id: number) => ({ kind: "user", id }) satisfies SocialActor;
const asAdmin = (id: number, role: "super_admin" | "pt") =>
  ({ kind: "admin", id, role }) satisfies SocialActor;

const addAdmin = async (name: string, role: "pt" | "super_admin" | null) => {
  const [row] = await db
    .insert(admins)
    .values({ username: name, usernameKey: name, passwordHash: "x", role })
    .returning({ id: admins.id });

  return row.id;
};

const addUser = async (name: string, ptAdminId: number | null) => {
  const [row] = await db
    .insert(users)
    .values({ name, nameKey: name, ptAdminId, termsVersion: TERMS_VERSION })
    .returning({ id: users.id });

  return row.id;
};

const insertPost = async (
  authorKind: "user" | "admin",
  authorId: number,
  privacy: "everyone" | "friends" | "only_me",
) => {
  const now = new Date();
  const [row] = await db
    .insert(socialPosts)
    .values({
      authorKind,
      authorId,
      privacy,
      caption: "x",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: socialPosts.id });

  return row.id;
};

const notificationsOf = (recipientKey: string) =>
  db
    .select()
    .from(socialNotifications)
    .where(eq(socialNotifications.recipientKey, recipientKey));

beforeEach(async () => {
  vi.restoreAllMocks();
  db = await createTestDb();
  state.db = db;
  superId = await addAdmin("root", null);
  ptA = await addAdmin("pta", "pt");
  ptB = await addAdmin("ptb", "pt");
  alice = await addUser("alice", ptA);
  bob = await addUser("bob", ptB);
  carol = await addUser("carol", null);
  state.user = { id: carol, name: "carol", termsVersion: TERMS_VERSION };
  state.admin = null;
});

describe("reactions", () => {
  it("sets, changes and removes one reaction per person", async () => {
    const post = await insertPost("user", alice, "everyone");

    await mutations.reactToPost(asUser(bob), post, "❤️");
    await mutations.reactToPost(asUser(bob), post, "💪");
    let rows = await db.select().from(socialReactions);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reactorKey: `user:${bob}`, emoji: "💪" });

    await mutations.reactToPost(asUser(carol), post, "👍");
    expect(await db.select().from(socialReactions)).toHaveLength(2);

    await mutations.reactToPost(asUser(bob), post, null);
    rows = await db.select().from(socialReactions);
    expect(rows.map((row) => row.reactorKey)).toEqual([`user:${carol}`]);
  });

  it("refuses a post the person cannot see and stores nothing", async () => {
    const hidden = await insertPost("user", alice, "only_me");
    const friendsOnly = await insertPost("user", alice, "friends");

    for (const [actor, post] of [
      [asUser(bob), hidden],
      [asUser(carol), friendsOnly],
      [asAdmin(ptB, "pt"), friendsOnly],
      [asAdmin(ptB, "pt"), hidden],
    ] as const) {
      expect(await mutations.reactToPost(actor, post, "❤️")).toEqual({
        ok: false,
        error: "not_found",
      });
    }
    expect(await db.select().from(socialReactions)).toHaveLength(0);
    expect(await db.select().from(socialNotifications)).toHaveLength(0);
  });

  it("lets the author's PT and the super admin react, not another PT", async () => {
    const post = await insertPost("user", alice, "only_me");

    expect(
      (await mutations.reactToPost(asAdmin(ptA, "pt"), post, "👍")).ok,
    ).toBe(true);
    expect(
      (await mutations.reactToPost(asAdmin(superId, "super_admin"), post, "👍"))
        .ok,
    ).toBe(true);
    expect(
      (await mutations.reactToPost(asAdmin(ptB, "pt"), post, "👍")).ok,
    ).toBe(false);
  });

  it("does not react to a deleted or missing post", async () => {
    const post = await insertPost("user", alice, "everyone");

    await postMutations.deletePost(asUser(alice), post);
    expect((await mutations.reactToPost(asUser(bob), post, "❤️")).ok).toBe(
      false,
    );
    expect((await mutations.reactToPost(asUser(bob), 9999, "❤️")).ok).toBe(
      false,
    );
  });

  it("validates the emoji and the terms in the action", async () => {
    const post = await insertPost("user", alice, "everyone");

    expect(
      await actions.reactAction("user", { postId: post, emoji: "🔥" }),
    ).toMatchObject({ status: "error" });
    state.user = { id: carol, name: "carol", termsVersion: null };
    expect(
      await actions.reactAction("user", { postId: post, emoji: "❤️" }),
    ).toMatchObject({ status: "error" });
    state.user = { id: carol, name: "carol", termsVersion: TERMS_VERSION };
    expect(
      await actions.reactAction("user", { postId: post, emoji: "❤️" }),
    ).toEqual({ status: "success" });
    expect(await db.select().from(socialReactions)).toHaveLength(1);
  });

  it("summarizes reactions and comments on the post view", async () => {
    const post = await insertPost("user", alice, "everyone");

    await mutations.reactToPost(asUser(bob), post, "❤️");
    await mutations.reactToPost(asUser(carol), post, "❤️");
    await mutations.addComment(asUser(bob), post, "hi");
    const view = await postQueries.getPostView(asUser(carol), post);

    expect(view?.reactions).toEqual({
      counts: [{ emoji: "❤️", count: 2 }],
      total: 2,
      mine: "❤️",
    });
    expect(view?.commentCount).toBe(1);
    expect(await postQueries.getPostView(asUser(carol), 9999)).toBeNull();
  });

  it("lists reactors only for a visible post", async () => {
    const post = await insertPost("user", alice, "only_me");

    await mutations.reactToPost(asAdmin(ptA, "pt"), post, "💪");
    expect(await queries.listReactors(asUser(bob), post)).toBeNull();
    expect(await queries.listReactors(asUser(alice), post)).toEqual([
      { name: "pta", emoji: "💪", isMe: false },
    ]);
  });
});

describe("reaction notifications", () => {
  it("notifies the author once and refreshes it when the reaction changes", async () => {
    const post = await insertPost("user", alice, "everyone");

    await mutations.reactToPost(asUser(bob), post, "❤️", new Date(1000));
    await db.update(socialNotifications).set({ readAt: new Date(2000) });
    await mutations.reactToPost(asUser(bob), post, "💪", new Date(3000));
    const rows = await notificationsOf(`user:${alice}`);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "post_reaction",
      actorKey: `user:${bob}`,
      postId: post,
      readAt: null,
    });
    expect(rows[0].createdAt.getTime()).toBe(3000);
  });

  it("does not notify for a reaction to my own post, and drops it on removal", async () => {
    const own = await insertPost("user", alice, "everyone");

    await mutations.reactToPost(asUser(alice), own, "❤️");
    expect(await db.select().from(socialNotifications)).toHaveLength(0);

    await mutations.reactToPost(asUser(bob), own, "❤️");
    expect(await db.select().from(socialNotifications)).toHaveLength(1);
    await mutations.reactToPost(asUser(bob), own, null);
    expect(await db.select().from(socialNotifications)).toHaveLength(0);
  });

  it("notifies an admin post's author with the admin key", async () => {
    const post = await insertPost("admin", ptA, "everyone");

    await mutations.reactToPost(asUser(alice), post, "👍");
    expect(await notificationsOf(`admin:${ptA}`)).toHaveLength(1);
    expect(await notificationsOf(`user:${ptA}`)).toHaveLength(0);
  });
});

describe("comments", () => {
  it("creates a comment on a visible post and notifies the author", async () => {
    const post = await insertPost("user", alice, "everyone");
    const result = await mutations.addComment(
      asUser(bob),
      post,
      "  Giỏi quá  ",
    );

    expect(result).toMatchObject({ ok: true });
    const [row] = await db.select().from(socialComments);

    expect(row).toMatchObject({
      postId: post,
      authorKey: `user:${bob}`,
      body: "Giỏi quá",
      updatedAt: null,
      deletedAt: null,
    });
    expect(await notificationsOf(`user:${alice}`)).toMatchObject([
      { kind: "post_comment", actorKey: `user:${bob}`, postId: post },
    ]);
  });

  it("each comment notifies; a comment on my own post does not", async () => {
    const post = await insertPost("user", alice, "everyone");

    await mutations.addComment(asUser(bob), post, "a");
    await mutations.addComment(asUser(bob), post, "b");
    await mutations.addComment(asUser(alice), post, "mine");
    expect(await notificationsOf(`user:${alice}`)).toHaveLength(2);
    expect(await db.select().from(socialNotifications)).toHaveLength(2);
  });

  it("refuses comments on an invisible post", async () => {
    const hidden = await insertPost("user", alice, "only_me");
    const friends = await insertPost("user", alice, "friends");

    expect((await mutations.addComment(asUser(bob), hidden, "x")).ok).toBe(
      false,
    );
    expect((await mutations.addComment(asUser(carol), friends, "x")).ok).toBe(
      false,
    );
    expect(
      (await mutations.addComment(asAdmin(ptB, "pt"), friends, "x")).ok,
    ).toBe(false);
    expect(
      (await mutations.addComment(asAdmin(ptA, "pt"), friends, "x")).ok,
    ).toBe(true);
    expect(await db.select().from(socialComments)).toHaveLength(1);
  });

  it("rejects empty and over-long bodies in the action", async () => {
    const post = await insertPost("user", alice, "everyone");

    expect(
      await actions.addCommentAction("user", { postId: post, body: "  " }),
    ).toMatchObject({ status: "error" });
    expect(
      await actions.addCommentAction("user", {
        postId: post,
        body: "a".repeat(1001),
      }),
    ).toMatchObject({ status: "error" });
    expect(await db.select().from(socialComments)).toHaveLength(0);
  });

  it("only the commenter edits, and only while the post is visible", async () => {
    const post = await insertPost("user", alice, "everyone");
    const { commentId } = (await mutations.addComment(
      asUser(bob),
      post,
      "old",
    )) as { commentId: number };

    expect(await mutations.editComment(asUser(alice), commentId, "x")).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(
      await mutations.editComment(
        asAdmin(superId, "super_admin"),
        commentId,
        "x",
      ),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(
      (await mutations.editComment(asUser(bob), commentId, " new ")).ok,
    ).toBe(true);
    const [row] = await db.select().from(socialComments);

    expect(row.body).toBe("new");
    expect(row.updatedAt).not.toBeNull();

    await db.update(socialPosts).set({ privacy: "only_me" });
    expect(
      await mutations.editComment(asUser(bob), commentId, "again"),
    ).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("the commenter, the post author and a super admin delete; others cannot", async () => {
    const post = await insertPost("user", alice, "everyone");
    const add = async (actor: SocialActor) =>
      ((await mutations.addComment(actor, post, "c")) as { commentId: number })
        .commentId;
    const byBob = await add(asUser(bob));

    expect(await mutations.deleteComment(asUser(carol), byBob)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await mutations.deleteComment(asAdmin(ptA, "pt"), byBob)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect((await mutations.deleteComment(asUser(alice), byBob)).ok).toBe(true);

    const second = await add(asUser(bob));

    expect((await mutations.deleteComment(asUser(bob), second)).ok).toBe(true);
    const third = await add(asUser(carol));

    expect(
      (await mutations.deleteComment(asAdmin(superId, "super_admin"), third))
        .ok,
    ).toBe(true);
    // Gone for good: a second delete finds nothing, the text is emptied.
    expect(await mutations.deleteComment(asUser(alice), byBob)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      (await db.select().from(socialComments)).every(
        (row) => row.deletedAt !== null && row.body === "",
      ),
    ).toBe(true);
    expect(
      (await postQueries.getPostView(asUser(alice), post))?.commentCount,
    ).toBe(0);
  });

  it("lists comments oldest first with edit and delete rights per viewer", async () => {
    const post = await insertPost("admin", superId, "everyone");

    await mutations.addComment(asUser(bob), post, "first", new Date(1000));
    await mutations.addComment(
      asAdmin(superId, "super_admin"),
      post,
      "second",
      new Date(2000),
    );
    await db
      .update(admins)
      .set({ verifiedAt: new Date() })
      .where(eq(admins.id, superId));
    const asBob = await queries.listComments(asUser(bob), post, "user");

    expect(asBob?.map((item) => item.body)).toEqual(["first", "second"]);
    expect(asBob?.map((item) => [item.canEdit, item.canDelete])).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(asBob?.[1]).toMatchObject({
      authorName: "root",
      authorVerified: true,
      authorHref: `/profile/admin/${superId}`,
    });
    const asSuper = await queries.listComments(
      asAdmin(superId, "super_admin"),
      post,
      "admin",
    );

    expect(asSuper?.map((item) => [item.canEdit, item.canDelete])).toEqual([
      [false, true],
      [true, true],
    ]);
    expect(await queries.listComments(asUser(carol), 9999, "user")).toBeNull();
    const hidden = await insertPost("user", alice, "only_me");

    expect(await queries.listComments(asUser(bob), hidden, "user")).toBeNull();
  });
});

describe("cleanup", () => {
  it("deleting a post removes its reactions, comments and notifications", async () => {
    const gone = await insertPost("user", alice, "everyone");
    const kept = await insertPost("user", carol, "everyone");

    for (const post of [gone, kept]) {
      await mutations.reactToPost(asUser(bob), post, "❤️");
      await mutations.addComment(asUser(bob), post, "hi");
    }
    await postMutations.deletePost(asUser(alice), gone);

    expect(
      (await db.select().from(socialReactions)).map((r) => r.postId),
    ).toEqual([kept]);
    expect(
      (await db.select().from(socialComments)).map((r) => r.postId),
    ).toEqual([kept]);
    expect(
      (await db.select().from(socialNotifications)).every(
        (r) => r.postId === kept,
      ),
    ).toBe(true);
  });

  it("deleting a trainee removes what they did, got and caused", async () => {
    const alicePost = await insertPost("user", alice, "everyone");
    const bobPost = await insertPost("user", bob, "everyone");
    const carolPost = await insertPost("user", carol, "everyone");

    await mutations.reactToPost(asUser(bob), alicePost, "❤️"); // notifies alice
    await mutations.addComment(asUser(carol), alicePost, "c"); // notifies alice
    await mutations.reactToPost(asUser(alice), bobPost, "👍"); // notifies bob
    await mutations.addComment(asUser(alice), carolPost, "from alice"); // notifies carol
    await mutations.reactToPost(asUser(bob), carolPost, "👍"); // unrelated
    await mutations.reactToPost(asAdmin(superId, "super_admin"), bobPost, "👍"); // an admin whose number equals a user id

    await db.transaction(async (tx) => {
      await cleanup.deleteSocialContentOfUser(tx, alice);
    });

    const reactions = await db.select().from(socialReactions);
    const comments = await db.select().from(socialComments);
    const notes = await db.select().from(socialNotifications);

    expect(reactions.map((r) => `${r.postId}:${r.reactorKey}`).sort()).toEqual(
      [`${bobPost}:admin:${superId}`, `${carolPost}:user:${bob}`].sort(),
    );
    expect(comments).toHaveLength(0);
    expect(
      notes.every(
        (n) =>
          n.recipientKey !== `user:${alice}` && n.actorKey !== `user:${alice}`,
      ),
    ).toBe(true);
    expect(notes.map((n) => n.postId).sort()).toEqual(
      [bobPost, carolPost].sort(),
    );
  });
});

describe("notification page data", () => {
  it("lists the latest 50 newest first, counts unread and marks all read", async () => {
    for (let index = 0; index < 55; index += 1) {
      await notifications.createNotification({
        recipientKey: `user:${alice}`,
        kind: "post_comment",
        actorKey: `user:${bob}`,
        postId: index + 1,
        now: new Date(1000 + index),
      });
    }
    await notifications.createNotification({
      recipientKey: `user:${carol}`,
      kind: "post_comment",
      actorKey: `user:${bob}`,
      postId: 1,
    });
    const key = `user:${alice}`;
    const list = await notifications.listNotifications(key);

    expect(await notifications.countUnreadNotifications(key)).toBe(55);
    expect(list).toHaveLength(50);
    expect(list[0]).toMatchObject({
      text: "bob đã bình luận về bài viết của bạn",
      href: "/post/55",
      isUnread: true,
    });
    expect(list[0].createdAt).toBeGreaterThan(list[49].createdAt);

    await notifications.markAllNotificationsRead(key);
    expect(await notifications.countUnreadNotifications(key)).toBe(0);
    expect(await notifications.countUnreadNotifications(`user:${carol}`)).toBe(
      1,
    );
  });

  it("links admin recipients to the admin post page", async () => {
    await notifications.createNotification({
      recipientKey: `admin:${ptA}`,
      kind: "post_reaction",
      actorKey: `user:${alice}`,
      postId: 4,
    });
    const [item] = await notifications.listNotifications(`admin:${ptA}`);

    expect(item.href).toBe("/admin/social/post/4");
    expect(item.text).toBe("alice đã bày tỏ cảm xúc về bài viết của bạn");
  });

  it("drops notifications older than 60 days", async () => {
    const now = new Date("2026-11-08T00:00:00Z");
    const day = 24 * 60 * 60 * 1000;

    for (const age of [61, 59]) {
      await notifications.createNotification({
        recipientKey: `user:${alice}`,
        kind: "post_comment",
        actorKey: `user:${bob}`,
        postId: age,
        now: new Date(now.getTime() - age * day),
      });
    }
    await notifications.purgeOldNotifications(now);
    expect(
      (await db.select().from(socialNotifications)).map((n) => n.postId),
    ).toEqual([59]);
  });
});

describe("social push", () => {
  const sender = vi.fn<Sender>();
  const base = new Date("2026-11-08T10:00:00Z");
  const hour = 60 * 60 * 1000;
  let post: number;

  const subscribe = (ownerKey: string) =>
    db.insert(pushSubscriptions).values({
      ownerKey,
      endpoint: `https://push.example/${ownerKey}`,
      p256dh: "p",
      auth: "a",
    });

  const react = async (actor: SocialActor, emoji: string, at: Date) => {
    const result = await mutations.reactToPost(actor, post, emoji, at);

    return (result as { notificationId: number | null }).notificationId;
  };

  beforeEach(async () => {
    sender.mockReset();
    sender.mockResolvedValue(undefined);
    push.resetChatPushForTests();
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    vi.stubEnv("VAPID_SUBJECT", "mailto:pt@example.com");
    post = await insertPost("user", alice, "everyone");
    await subscribe(`user:${alice}`);
  });

  it("pushes a reaction in Vietnamese to the author's devices only", async () => {
    await subscribe(`user:${bob}`);
    const id = await react(asUser(bob), "❤️", base);

    await notifications.sendSocialPush(
      { notificationId: id as number },
      sender,
      base,
    );
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender.mock.calls[0][0].endpoint).toBe(
      `https://push.example/user:${alice}`,
    );
    expect(sender.mock.calls[0][1]).toMatchObject({
      body: "bob đã bày tỏ cảm xúc về bài viết của bạn",
      url: `/post/${post}`,
    });
  });

  it("sends at most one reaction push per post per recipient per hour", async () => {
    const first = await react(asUser(bob), "❤️", base);

    await notifications.sendSocialPush(
      { notificationId: first as number },
      sender,
      base,
    );
    // The same person changing the emoji reuses the notification.
    const changed = await react(
      asUser(bob),
      "💪",
      new Date(base.getTime() + 60_000),
    );

    expect(changed).toBe(first);
    await notifications.sendSocialPush(
      { notificationId: changed as number },
      sender,
      new Date(base.getTime() + 60_000),
    );
    // Someone else, still inside the hour.
    const other = await react(
      asUser(carol),
      "👍",
      new Date(base.getTime() + 120_000),
    );

    await notifications.sendSocialPush(
      { notificationId: other as number },
      sender,
      new Date(base.getTime() + 120_000),
    );
    expect(sender).toHaveBeenCalledTimes(1);

    // After the hour another one goes out.
    const later = new Date(base.getTime() + hour + 1000);
    const again = await react(asUser(carol), "😮", later);

    await notifications.sendSocialPush(
      { notificationId: again as number },
      sender,
      later,
    );
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it("keeps the throttle per post", async () => {
    const otherPost = await insertPost("user", alice, "everyone");
    const first = await react(asUser(bob), "❤️", base);
    const second = (await mutations.reactToPost(
      asUser(bob),
      otherPost,
      "❤️",
      base,
    )) as {
      notificationId: number;
    };

    await notifications.sendSocialPush(
      { notificationId: first as number },
      sender,
      base,
    );
    await notifications.sendSocialPush(
      { notificationId: second.notificationId },
      sender,
      base,
    );
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it("always pushes a comment, with a preview of the text", async () => {
    for (const text of ["một", "hai"]) {
      const result = (await mutations.addComment(
        asUser(bob),
        post,
        text,
        base,
      )) as {
        notificationId: number;
      };

      await notifications.sendSocialPush(
        { notificationId: result.notificationId, commentBody: text },
        sender,
        base,
      );
    }
    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender.mock.calls[1][1].body).toBe("bob đã bình luận: hai");
  });

  it("skips quietly without VAPID or a subscription", async () => {
    const id = (await react(asUser(bob), "❤️", base)) as number;

    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    await notifications.sendSocialPush({ notificationId: id }, sender, base);
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    await db.delete(pushSubscriptions);
    await notifications.sendSocialPush({ notificationId: id }, sender, base);
    expect(sender).not.toHaveBeenCalled();
    const [row] = await db
      .select()
      .from(socialNotifications)
      .where(eq(socialNotifications.id, id));

    expect(row.pushedAt).toBeNull();
  });

  it("never throws when the push service fails, and drops a dead subscription", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = (await react(asUser(bob), "❤️", base)) as number;

    sender.mockRejectedValueOnce(
      Object.assign(new Error("gone"), { statusCode: 410 }),
    );
    await expect(
      notifications.sendSocialPush({ notificationId: id }, sender, base),
    ).resolves.toBeUndefined();
    expect(
      await db
        .select()
        .from(pushSubscriptions)
        .where(and(eq(pushSubscriptions.ownerKey, `user:${alice}`))),
    ).toHaveLength(0);
  });
});
