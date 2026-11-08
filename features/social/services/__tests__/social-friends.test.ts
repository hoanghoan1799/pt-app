import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  admins,
  rateLimits,
  socialBlocks,
  socialComments,
  socialFriendships,
  socialNotifications,
  socialPostPhotos,
  socialPosts,
  socialReports,
  users,
} from "@/db/schema";
import {
  FRIEND_REQUESTS_PER_DAY,
  TERMS_VERSION,
} from "@/features/social/constants/social";
import type { SocialActor } from "@/features/social/types/social";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as unknown,
  admin: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ default: { sendNotification: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/logger", () => ({
  logServerError: vi.fn(() => ({ code: "UNKNOWN" })),
}));
vi.mock("@/services/admin-lock", () => ({
  canSeeHiddenUsers: vi.fn(async () => false),
}));
vi.mock("@/services/auth-guard", () => ({
  requireUser: vi.fn(async () => state.user),
  requireAdmin: vi.fn(async () => state.admin),
  requireSuperAdmin: vi.fn(async () => {
    const admin = state.admin as { role: string };

    if (admin.role !== "super_admin") {
      throw new Error("NEXT_REDIRECT");
    }
    return admin;
  }),
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const friends = await import("@/features/social/services/friend-mutations");
const friendQueries = await import("@/features/social/services/friend-queries");
const friendActions = await import("@/features/social/services/friend-actions");
const reports = await import("@/features/social/services/report-mutations");
const reportQueries = await import("@/features/social/services/report-queries");
const relationships = await import("@/features/social/services/relationships");
const engagement =
  await import("@/features/social/services/engagement-mutations");
const engagementQueries =
  await import("@/features/social/services/engagement-queries");
const postQueries = await import("@/features/social/services/post-queries");
const postAccess = await import("@/features/social/services/post-access");
const photos = await import("@/features/social/services/post-photos");
const cleanup = await import("@/features/social/services/post-cleanup");

let db: TestDb;
let superId: number;
let ptA: number;
let alice: number;
let bob: number;
let carol: number;

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

const addUser = async (
  name: string,
  options: { ptAdminId?: number | null; terms?: boolean } = {},
) => {
  const [row] = await db
    .insert(users)
    .values({
      name,
      nameKey: name,
      email: `${name}@Example.com`,
      emailKey: `${name}@example.com`,
      ptAdminId: options.ptAdminId ?? null,
      termsVersion: options.terms === false ? null : TERMS_VERSION,
    })
    .returning({ id: users.id });

  return row.id;
};

const insertPost = async (
  authorKind: "user" | "admin",
  authorId: number,
  privacy: "everyone" | "friends" | "only_me",
  now = new Date(),
) => {
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

const befriend = async (a: number, b: number) => {
  await friends.sendFriendRequest(a, b);
  await friends.acceptFriendRequest(b, a);
};

const notificationsOf = (key: string) =>
  db
    .select()
    .from(socialNotifications)
    .where(eq(socialNotifications.recipientKey, key));

const feedIds = async (userId: number) =>
  (await postQueries.listUserFeed(userId)).posts.map((post) => post.id);

beforeEach(async () => {
  vi.restoreAllMocks();
  db = await createTestDb();
  state.db = db;
  superId = await addAdmin("root", null);
  ptA = await addAdmin("pta", "pt");
  alice = await addUser("alice", { ptAdminId: ptA });
  bob = await addUser("bob");
  carol = await addUser("carol");
  state.user = { id: alice, name: "alice", termsVersion: TERMS_VERSION };
  state.admin = { id: superId, role: "super_admin" };
});

describe("email search", () => {
  it("finds a trainee by the full email, trimmed and case-insensitive", async () => {
    const found = await friendQueries.searchTraineeByEmail(
      alice,
      "  BOB@Example.COM ",
    );

    expect(found).toMatchObject({
      id: bob,
      name: "bob",
      relationship: "none",
    });
  });

  it("never matches a prefix, a fragment or a wildcard", async () => {
    for (const query of [
      "bob",
      "bob@",
      "bo@example.com",
      "bob@example",
      "%@example.com",
      "bob@example.com%",
      "_ob@example.com",
      "",
      42,
      null,
    ]) {
      expect(await friendQueries.searchTraineeByEmail(alice, query)).toBeNull();
    }
  });

  it("returns nothing for yourself, unknown emails and trainees without accepted terms", async () => {
    await addUser("dave", { terms: false });

    expect(
      await friendQueries.searchTraineeByEmail(alice, "alice@example.com"),
    ).toBeNull();
    expect(
      await friendQueries.searchTraineeByEmail(alice, "nobody@example.com"),
    ).toBeNull();
    expect(
      await friendQueries.searchTraineeByEmail(alice, "dave@example.com"),
    ).toBeNull();
  });

  it("returns nothing when either side blocked the other", async () => {
    await friends.blockUser(alice, bob);

    expect(
      await friendQueries.searchTraineeByEmail(alice, "bob@example.com"),
    ).toBeNull();
    expect(
      await friendQueries.searchTraineeByEmail(bob, "alice@example.com"),
    ).toBeNull();
  });

  it("reports the relationship in the result", async () => {
    await friends.sendFriendRequest(alice, bob);

    expect(
      (await friendQueries.searchTraineeByEmail(alice, "bob@example.com"))
        ?.relationship,
    ).toBe("sent");
    expect(
      (await friendQueries.searchTraineeByEmail(bob, "alice@example.com"))
        ?.relationship,
    ).toBe("received");
  });

  it("the search action turns away a half-typed email and a trainee without terms", async () => {
    expect(await friendActions.searchFriendAction("bob")).toMatchObject({
      status: "error",
    });
    state.user = { id: alice, name: "alice", termsVersion: null };
    expect(
      await friendActions.searchFriendAction("bob@example.com"),
    ).toMatchObject({ status: "error" });
  });
});

describe("friend request lifecycle", () => {
  it("send, accept: one row per pair and a notification each way", async () => {
    const sent = await friends.sendFriendRequest(bob, alice);

    expect(sent).toMatchObject({ ok: true, accepted: false });
    let rows = await db.select().from(socialFriendships);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userLow: alice,
      userHigh: bob,
      status: "pending",
      requestedBy: bob,
      acceptedAt: null,
    });
    expect((await notificationsOf(`user:${alice}`)).map((n) => n.kind)).toEqual(
      ["friend_request"],
    );

    expect(await friends.acceptFriendRequest(alice, bob)).toMatchObject({
      ok: true,
    });
    rows = await db.select().from(socialFriendships);
    expect(rows[0].status).toBe("accepted");
    expect(rows[0].acceptedAt).not.toBeNull();
    expect(await notificationsOf(`user:${alice}`)).toHaveLength(0);
    expect((await notificationsOf(`user:${bob}`)).map((n) => n.kind)).toEqual([
      "friend_accepted",
    ]);
    expect(await relationships.getRelationship(alice, bob)).toBe("friends");
  });

  it("refuses duplicates, yourself, unknown, no-terms and blocked targets", async () => {
    const noTerms = await addUser("dave", { terms: false });

    await friends.sendFriendRequest(alice, bob);
    expect(await friends.sendFriendRequest(alice, bob)).toEqual({
      ok: false,
      error: "already_requested",
    });
    for (const target of [alice, 9999, noTerms]) {
      expect(await friends.sendFriendRequest(alice, target)).toEqual({
        ok: false,
        error: "not_found",
      });
    }
    await friends.blockUser(carol, alice);
    expect(await friends.sendFriendRequest(alice, carol)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await db.select().from(socialFriendships)).toHaveLength(1);
  });

  it("refuses a request between people who are already friends", async () => {
    await befriend(alice, bob);

    expect(await friends.sendFriendRequest(alice, bob)).toEqual({
      ok: false,
      error: "already_friends",
    });
    expect(await friends.sendFriendRequest(bob, alice)).toEqual({
      ok: false,
      error: "already_friends",
    });
  });

  it("only the one who was asked can accept or decline", async () => {
    await friends.sendFriendRequest(alice, bob);

    expect(await friends.acceptFriendRequest(alice, bob)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await friends.declineFriendRequest(alice, bob)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await friends.acceptFriendRequest(carol, alice)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect((await db.select().from(socialFriendships))[0].status).toBe(
      "pending",
    );
  });

  it("decline deletes the row and the request can be sent again", async () => {
    await friends.sendFriendRequest(alice, bob);
    expect((await friends.declineFriendRequest(bob, alice)).ok).toBe(true);

    expect(await db.select().from(socialFriendships)).toHaveLength(0);
    expect(await notificationsOf(`user:${bob}`)).toHaveLength(0);
    expect((await friends.sendFriendRequest(alice, bob)).ok).toBe(true);
    expect(await notificationsOf(`user:${bob}`)).toHaveLength(1);
  });

  it("cancel removes my own request and its notification, not theirs", async () => {
    await friends.sendFriendRequest(alice, bob);

    expect(await friends.cancelFriendRequest(bob, alice)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect((await friends.cancelFriendRequest(alice, bob)).ok).toBe(true);
    expect(await db.select().from(socialFriendships)).toHaveLength(0);
    expect(await notificationsOf(`user:${bob}`)).toHaveLength(0);
  });

  it("asking someone who already asked me accepts at once", async () => {
    await friends.sendFriendRequest(alice, bob);
    const result = await friends.sendFriendRequest(bob, alice);

    expect(result).toMatchObject({ ok: true, accepted: true });
    expect((await db.select().from(socialFriendships))[0].status).toBe(
      "accepted",
    );
  });

  it("unfriend deletes an accepted friendship only", async () => {
    await friends.sendFriendRequest(alice, bob);
    expect((await friends.unfriend(alice, bob)).ok).toBe(false);
    await friends.acceptFriendRequest(bob, alice);
    expect((await friends.unfriend(bob, alice)).ok).toBe(true);
    expect(await db.select().from(socialFriendships)).toHaveLength(0);
    expect(await relationships.getRelationship(alice, bob)).toBe("none");
  });

  it("limits requests to 20 a day and starts over the next day", async () => {
    const day = new Date("2026-11-08T08:00:00Z");
    const targets: number[] = [];

    for (let i = 0; i <= FRIEND_REQUESTS_PER_DAY; i += 1) {
      targets.push(await addUser(`t${i}`));
    }
    for (const target of targets.slice(0, FRIEND_REQUESTS_PER_DAY)) {
      expect((await friends.sendFriendRequest(alice, target, day)).ok).toBe(
        true,
      );
    }
    expect(
      await friends.sendFriendRequest(
        alice,
        targets[FRIEND_REQUESTS_PER_DAY],
        day,
      ),
    ).toEqual({ ok: false, error: "rate_limited" });
    expect(
      (
        await db
          .select()
          .from(rateLimits)
          .where(eq(rateLimits.key, `friend-request:${alice}`))
      )[0].count,
    ).toBeGreaterThan(FRIEND_REQUESTS_PER_DAY);

    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);

    expect(
      (
        await friends.sendFriendRequest(
          alice,
          targets[FRIEND_REQUESTS_PER_DAY],
          nextDay,
        )
      ).ok,
    ).toBe(true);
  });

  it("the actions refuse a trainee without accepted terms", async () => {
    state.user = { id: alice, name: "alice", termsVersion: null };

    expect(await friendActions.sendFriendRequestAction(bob)).toMatchObject({
      status: "error",
    });
    expect(await db.select().from(socialFriendships)).toHaveLength(0);
  });

  it("lists friends, received and sent requests", async () => {
    await befriend(alice, bob);
    await friends.sendFriendRequest(carol, alice);
    const dave = await addUser("dave");

    await friends.sendFriendRequest(alice, dave);

    expect((await friendQueries.listFriends(alice)).map((p) => p.id)).toEqual([
      bob,
    ]);
    const requests = await friendQueries.listFriendRequests(alice);

    expect(requests.received.map((p) => p.id)).toEqual([carol]);
    expect(requests.sent.map((p) => p.id)).toEqual([dave]);
    expect(await relationships.countFriends(alice)).toBe(1);
  });
});

describe("visibility with friends", () => {
  it("a friends-only post is visible to a friend, not to a stranger", async () => {
    const post = await insertPost("user", bob, "friends");

    expect(await postAccess.loadVisiblePost(asUser(alice), post)).toBeNull();
    await befriend(alice, bob);
    expect(
      await postAccess.loadVisiblePost(asUser(alice), post),
    ).not.toBeNull();
    expect(await postAccess.loadVisiblePost(asUser(carol), post)).toBeNull();
  });

  it("feed = own + accepted friends' everyone/friends posts + reachable admin posts", async () => {
    const own = await insertPost("user", alice, "only_me");
    const friendFriends = await insertPost("user", bob, "friends");
    const friendEveryone = await insertPost("user", bob, "everyone");
    const friendPrivate = await insertPost("user", bob, "only_me");
    const strangerEveryone = await insertPost("user", carol, "everyone");
    const adminPost = await insertPost("admin", superId, "friends");
    const otherPtPost = await insertPost(
      "admin",
      await addAdmin("ptb", "pt"),
      "friends",
    );

    await befriend(alice, bob);
    const ids = await feedIds(alice);

    expect(ids.sort()).toEqual(
      [own, friendFriends, friendEveryone, adminPost].sort(),
    );
    expect(ids).not.toContain(friendPrivate);
    expect(ids).not.toContain(strangerEveryone);
    expect(ids).not.toContain(otherPtPost);
  });

  it("a pending request does not open the feed or the profile", async () => {
    const post = await insertPost("user", bob, "friends");

    await friends.sendFriendRequest(alice, bob);
    expect(await feedIds(alice)).not.toContain(post);
    expect(
      (
        await postQueries.listProfilePosts(asUser(alice), {
          kind: "user",
          id: bob,
        })
      ).posts,
    ).toHaveLength(0);
  });

  it("the feed keeps newest first and pages with the cursor", async () => {
    await befriend(alice, bob);
    const ids: number[] = [];

    for (let i = 0; i < 23; i += 1) {
      ids.push(await insertPost("user", i % 2 ? alice : bob, "friends"));
    }
    const first = await postQueries.listUserFeed(alice);

    expect(first.posts.map((post) => post.id)).toEqual(
      ids.slice().reverse().slice(0, 20),
    );
    const second = await postQueries.listUserFeed(alice, first.nextCursor);

    expect(second.posts.map((post) => post.id)).toEqual(
      ids.slice().reverse().slice(20),
    );
    expect(second.nextCursor).toBeNull();
  });

  it("the profile list follows the same rules", async () => {
    const everyone = await insertPost("user", bob, "everyone");
    const friendsOnly = await insertPost("user", bob, "friends");

    await insertPost("user", bob, "only_me");
    const list = () =>
      postQueries
        .listProfilePosts(asUser(alice), { kind: "user", id: bob })
        .then((page) => page.posts.map((post) => post.id));

    expect(await list()).toEqual([everyone]);
    await befriend(alice, bob);
    expect((await list()).sort()).toEqual([everyone, friendsOnly].sort());
  });

  it("the photo route serves a friends-only photo to friends only", async () => {
    const post = await insertPost("user", bob, "friends");
    const [photo] = await db
      .insert(socialPostPhotos)
      .values({
        uploaderKey: `user:${bob}`,
        postId: post,
        mime: "image/webp",
        width: 1,
        height: 1,
        data: Buffer.from("x"),
        size: 1,
        createdAt: new Date(),
      })
      .returning({ id: socialPostPhotos.id });

    expect(
      await photos.findPostPhotoForViewer(photo.id, asUser(alice)),
    ).toBeNull();
    await befriend(alice, bob);
    expect(
      await photos.findPostPhotoForViewer(photo.id, asUser(alice)),
    ).not.toBeNull();
    await friends.blockUser(bob, alice);
    expect(
      await photos.findPostPhotoForViewer(photo.id, asUser(alice)),
    ).toBeNull();
  });

  it("the photo route serves a trainee's photo only to admins with that trainee in scope", async () => {
    const insertPhoto = async (author: number) => {
      const post = await insertPost("user", author, "everyone");
      const [photo] = await db
        .insert(socialPostPhotos)
        .values({
          uploaderKey: `user:${author}`,
          postId: post,
          mime: "image/webp",
          width: 1,
          height: 1,
          data: Buffer.from("x"),
          size: 1,
          createdAt: new Date(),
        })
        .returning({ id: socialPostPhotos.id });

      return photo.id;
    };
    const bobPhoto = await insertPhoto(bob);
    const alicePhoto = await insertPhoto(alice);

    // bob is outside PT A's workspace, alice is inside it.
    expect(
      await photos.findPostPhotoForViewer(bobPhoto, asAdmin(ptA, "pt")),
    ).toBeNull();
    expect(
      await photos.findPostPhotoForViewer(alicePhoto, asAdmin(ptA, "pt")),
    ).not.toBeNull();
    expect(
      await photos.findPostPhotoForViewer(
        bobPhoto,
        asAdmin(superId, "super_admin"),
      ),
    ).not.toBeNull();
  });
});

describe("block", () => {
  it("ends the friendship, a pending request and the friend notifications", async () => {
    await befriend(alice, bob);
    await friends.sendFriendRequest(carol, alice);

    expect((await friends.blockUser(alice, bob)).ok).toBe(true);
    expect((await friends.blockUser(alice, carol)).ok).toBe(true);
    expect(await db.select().from(socialFriendships)).toHaveLength(0);
    expect(await notificationsOf(`user:${alice}`)).toHaveLength(0);
    expect(await notificationsOf(`user:${bob}`)).toHaveLength(0);
    expect(await db.select().from(socialBlocks)).toHaveLength(2);
  });

  it("blocking twice is harmless; blocking yourself or an unknown id is refused", async () => {
    await friends.blockUser(alice, bob);

    expect((await friends.blockUser(alice, bob)).ok).toBe(true);
    expect(await db.select().from(socialBlocks)).toHaveLength(1);
    expect((await friends.blockUser(alice, alice)).ok).toBe(false);
    expect((await friends.blockUser(alice, 9999)).ok).toBe(false);
  });

  it("hides posts both ways, from the feed, profile and detail", async () => {
    const alicePost = await insertPost("user", alice, "everyone");
    const bobPost = await insertPost("user", bob, "everyone");

    await befriend(alice, bob);
    await friends.blockUser(alice, bob);

    for (const [viewer, post, owner] of [
      [alice, bobPost, bob],
      [bob, alicePost, alice],
    ] as const) {
      expect(await postAccess.loadVisiblePost(asUser(viewer), post)).toBeNull();
      expect(await feedIds(viewer)).not.toContain(post);
      expect(
        (
          await postQueries.listProfilePosts(asUser(viewer), {
            kind: "user",
            id: owner,
          })
        ).posts,
      ).toHaveLength(0);
      expect(await postQueries.getPostView(asUser(viewer), post)).toBeNull();
    }
    expect(await relationships.isBlockedBetween(bob, alice)).toBe(true);
  });

  it("cannot react or comment on each other's posts", async () => {
    const alicePost = await insertPost("user", alice, "everyone");

    await friends.blockUser(alice, bob);
    expect(await engagement.reactToPost(asUser(bob), alicePost, "❤️")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await engagement.addComment(asUser(bob), alicePost, "hi")).toEqual({
      ok: false,
      error: "not_found",
    });
    const bobPost = await insertPost("user", bob, "everyone");

    expect((await engagement.addComment(asUser(alice), bobPost, "hi")).ok).toBe(
      false,
    );
  });

  it("hides the other person's comments on a third party's post and uncounts them", async () => {
    const carolPost = await insertPost("user", carol, "everyone");

    await engagement.addComment(asUser(alice), carolPost, "from alice");
    await engagement.addComment(asUser(bob), carolPost, "from bob");
    await engagement.addComment(asUser(carol), carolPost, "from carol");

    const bodies = async (viewer: SocialActor) =>
      (await engagementQueries.listComments(viewer, carolPost, "user"))?.map(
        (comment) => comment.body,
      );

    expect(await bodies(asUser(alice))).toEqual([
      "from alice",
      "from bob",
      "from carol",
    ]);
    await friends.blockUser(alice, bob);
    expect(await bodies(asUser(alice))).toEqual(["from alice", "from carol"]);
    expect(await bodies(asUser(bob))).toEqual(["from bob", "from carol"]);
    expect(await bodies(asUser(carol))).toHaveLength(3);
    expect(await bodies(asAdmin(superId, "super_admin"))).toHaveLength(3);

    const count = async (viewer: SocialActor) =>
      (await postQueries.getPostView(viewer, carolPost))?.commentCount;

    expect(await count(asUser(alice))).toBe(2);
    expect(await count(asUser(carol))).toBe(3);
  });

  it("unblock is the blocker's and does not bring the friendship back", async () => {
    await befriend(alice, bob);
    await friends.blockUser(alice, bob);

    expect(await friends.unblockUser(bob, alice)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await relationships.isBlockedBetween(alice, bob)).toBe(true);
    expect((await friends.unblockUser(alice, bob)).ok).toBe(true);
    expect(await relationships.isBlockedBetween(alice, bob)).toBe(false);
    expect(await relationships.getRelationship(alice, bob)).toBe("none");
    expect(
      (await friendQueries.listBlockedByMe(alice)).map((p) => p.id),
    ).toEqual([]);
  });

  it("lists only the people I blocked", async () => {
    await friends.blockUser(alice, bob);
    await friends.blockUser(carol, alice);

    expect(
      (await friendQueries.listBlockedByMe(alice)).map((p) => p.id),
    ).toEqual([bob]);
  });

  it("does not affect admins: the super admin and the PT still see everything", async () => {
    const bobPost = await insertPost("user", bob, "friends");
    const alicePost = await insertPost("user", alice, "only_me");

    await friends.blockUser(bob, alice);
    expect(
      await postAccess.loadVisiblePost(
        asAdmin(superId, "super_admin"),
        bobPost,
      ),
    ).not.toBeNull();
    expect(
      await postAccess.loadVisiblePost(asAdmin(ptA, "pt"), alicePost),
    ).not.toBeNull();
  });
});

describe("reports", () => {
  it("a trainee reports a visible post, a comment and a user; duplicates collapse", async () => {
    const post = await insertPost("user", bob, "everyone");
    const comment = (await engagement.addComment(
      asUser(bob),
      post,
      "rude",
    )) as {
      commentId: number;
    };

    expect(
      (
        await reports.createReport(asUser(alice), {
          targetKind: "post",
          targetId: post,
          reason: "spam",
        })
      ).ok,
    ).toBe(true);
    await reports.createReport(asUser(alice), {
      targetKind: "post",
      targetId: post,
      reason: "again",
    });
    await reports.createReport(asUser(alice), {
      targetKind: "comment",
      targetId: comment.commentId,
      reason: "",
    });
    await reports.createReport(asUser(alice), {
      targetKind: "user",
      targetId: bob,
      reason: "",
    });
    const rows = await db.select().from(socialReports);

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.status === "open")).toBe(true);
    expect(rows.find((row) => row.targetKind === "post")?.reason).toBe("spam");
    expect(await reportQueries.countOpenReports()).toBe(3);
  });

  it("refuses what the reporter cannot see, their own content, and themselves", async () => {
    const hidden = await insertPost("user", bob, "only_me");
    const mine = await insertPost("user", alice, "everyone");

    for (const input of [
      { targetKind: "post", targetId: hidden },
      { targetKind: "post", targetId: mine },
      { targetKind: "post", targetId: 9999 },
      { targetKind: "comment", targetId: 9999 },
      { targetKind: "user", targetId: alice },
      { targetKind: "user", targetId: 9999 },
    ] as const) {
      expect(
        await reports.createReport(asUser(alice), { ...input, reason: "" }),
      ).toEqual({ ok: false, error: "not_found" });
    }
    await friends.blockUser(alice, bob);
    expect(
      await reports.createReport(asUser(alice), {
        targetKind: "user",
        targetId: bob,
        reason: "",
      }),
    ).toEqual({ ok: false, error: "not_found" });
    expect(await db.select().from(socialReports)).toHaveLength(0);
  });

  it("an admin can report; a PT only for their own workspace", async () => {
    expect(
      (
        await reports.createReport(asAdmin(ptA, "pt"), {
          targetKind: "user",
          targetId: alice,
          reason: "",
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await reports.createReport(asAdmin(ptA, "pt"), {
          targetKind: "user",
          targetId: bob,
          reason: "",
        })
      ).ok,
    ).toBe(false);
  });

  it("the list shows a preview, reporter and target", async () => {
    const post = await insertPost("user", bob, "everyone");

    await reports.createReport(asUser(alice), {
      targetKind: "post",
      targetId: post,
      reason: "spam",
    });
    const [report] = await reportQueries.listOpenReports();

    expect(report).toMatchObject({
      targetKind: "post",
      preview: "x",
      targetName: "bob",
      reporterName: "alice",
      reason: "spam",
    });
  });

  it("a PT cannot resolve, the service and the action both refuse", async () => {
    const post = await insertPost("user", bob, "everyone");

    await reports.createReport(asUser(alice), {
      targetKind: "post",
      targetId: post,
      reason: "",
    });
    const [report] = await db.select().from(socialReports);

    expect(
      await reports.resolveReport(asAdmin(ptA, "pt"), report.id, "deleted"),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(
      await reports.resolveReport(asUser(alice), report.id, "deleted"),
    ).toEqual({ ok: false, error: "forbidden" });

    state.admin = { id: ptA, role: "pt" };
    expect(
      await friendActions.resolveReportAction({
        reportId: report.id,
        resolution: "deleted",
      }),
    ).toMatchObject({ status: "error" });
    expect(
      (await db.select().from(socialPosts).where(eq(socialPosts.id, post)))[0]
        .deletedAt,
    ).toBeNull();
    expect((await db.select().from(socialReports))[0].status).toBe("open");
  });

  it("keeping closes the report and leaves the post", async () => {
    const post = await insertPost("user", bob, "everyone");

    await reports.createReport(asUser(alice), {
      targetKind: "post",
      targetId: post,
      reason: "",
    });
    const [report] = await db.select().from(socialReports);
    const now = new Date();

    expect(
      (
        await reports.resolveReport(
          asAdmin(superId, "super_admin"),
          report.id,
          "kept",
          now,
        )
      ).ok,
    ).toBe(true);
    const [after] = await db.select().from(socialReports);

    expect(after).toMatchObject({
      status: "resolved",
      resolution: "kept",
      resolvedBy: superId,
    });
    expect(after.resolvedAt?.getTime()).toBe(now.getTime());
    expect(
      (await db.select().from(socialPosts).where(eq(socialPosts.id, post)))[0]
        .deletedAt,
    ).toBeNull();
    expect(await reportQueries.countOpenReports()).toBe(0);
    expect(
      await reports.resolveReport(
        asAdmin(superId, "super_admin"),
        report.id,
        "kept",
      ),
    ).toEqual({ ok: false, error: "not_found" });
  });

  it("deleting removes the post and closes every report on it", async () => {
    const post = await insertPost("user", bob, "everyone");

    for (const reporter of [alice, carol]) {
      await reports.createReport(asUser(reporter), {
        targetKind: "post",
        targetId: post,
        reason: "",
      });
    }
    const [first] = await db.select().from(socialReports);

    await reports.resolveReport(
      asAdmin(superId, "super_admin"),
      first.id,
      "deleted",
    );
    expect(
      (await db.select().from(socialPosts).where(eq(socialPosts.id, post)))[0]
        .deletedAt,
    ).not.toBeNull();
    const rows = await db.select().from(socialReports);

    expect(rows.every((row) => row.resolution === "deleted")).toBe(true);
  });

  it("deleting a reported comment empties it; a user report just closes", async () => {
    const post = await insertPost("user", carol, "everyone");
    const comment = (await engagement.addComment(
      asUser(bob),
      post,
      "rude",
    )) as {
      commentId: number;
    };

    await reports.createReport(asUser(alice), {
      targetKind: "comment",
      targetId: comment.commentId,
      reason: "",
    });
    await reports.createReport(asUser(alice), {
      targetKind: "user",
      targetId: bob,
      reason: "",
    });
    const rows = await db.select().from(socialReports);
    const root = asAdmin(superId, "super_admin");

    for (const row of rows) {
      expect((await reports.resolveReport(root, row.id, "deleted")).ok).toBe(
        true,
      );
    }
    const [deleted] = await db
      .select()
      .from(socialComments)
      .where(eq(socialComments.id, comment.commentId));

    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.body).toBe("");
    const resolutions = await db.select().from(socialReports);

    expect(
      resolutions.find((row) => row.targetKind === "user")?.resolution,
    ).toBe("kept");
    expect(
      (await db.select().from(users).where(eq(users.id, bob))).length,
    ).toBe(1);
  });

  it("an already deleted target can still be resolved", async () => {
    const post = await insertPost("user", bob, "everyone");

    await reports.createReport(asUser(alice), {
      targetKind: "post",
      targetId: post,
      reason: "",
    });
    await db
      .update(socialPosts)
      .set({ deletedAt: new Date() })
      .where(eq(socialPosts.id, post));
    const [report] = await db.select().from(socialReports);

    expect((await reportQueries.listOpenReports())[0].preview).toBeNull();
    expect(
      (
        await reports.resolveReport(
          asAdmin(superId, "super_admin"),
          report.id,
          "deleted",
        )
      ).ok,
    ).toBe(true);
  });

  it("the report action validates the reason length", async () => {
    const post = await insertPost("user", bob, "everyone");

    expect(
      await friendActions.reportAction("user", {
        targetKind: "post",
        targetId: post,
        reason: "x".repeat(501),
      }),
    ).toMatchObject({ status: "error" });
    expect(
      await friendActions.reportAction("user", {
        targetKind: "post",
        targetId: post,
        reason: "x".repeat(500),
      }),
    ).toMatchObject({ status: "success" });
  });
});

describe("member delete cleanup", () => {
  it("removes friendships, blocks and reports by or about the trainee", async () => {
    const alicePost = await insertPost("user", alice, "everyone");
    const bobPost = await insertPost("user", bob, "everyone");
    const comment = (await engagement.addComment(
      asUser(alice),
      bobPost,
      "c",
    )) as {
      commentId: number;
    };

    await befriend(alice, bob);
    await friends.sendFriendRequest(alice, carol);
    await friends.blockUser(carol, alice);
    await friends.blockUser(bob, carol);
    await reports.createReport(asUser(alice), {
      targetKind: "post",
      targetId: bobPost,
      reason: "",
    });
    await reports.createReport(asUser(bob), {
      targetKind: "post",
      targetId: alicePost,
      reason: "",
    });
    await reports.createReport(asUser(carol), {
      targetKind: "user",
      targetId: alice,
      reason: "",
    });
    await reports.createReport(asUser(carol), {
      targetKind: "comment",
      targetId: comment.commentId,
      reason: "",
    });
    await reports.createReport(asUser(await addUser("dave")), {
      targetKind: "user",
      targetId: bob,
      reason: "keep",
    });

    await db.transaction(async (tx) => {
      await cleanup.deleteSocialContentOfUser(tx, alice);
    });

    expect(await db.select().from(socialFriendships)).toHaveLength(0);
    const blocks = await db.select().from(socialBlocks);

    expect(blocks.map((row) => `${row.blockerId}>${row.blockedId}`)).toEqual([
      `${bob}>${carol}`,
    ]);
    const left = await db.select().from(socialReports);

    expect(left.map((row) => row.reason)).toEqual(["keep"]);
  });
});
