import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { admins, socialPostPhotos, socialPosts, users } from "@/db/schema";
import { TERMS_VERSION } from "@/features/social/constants/social";

type TestUser = { id: number; name: string; termsVersion: number | null };
type TestAdmin = {
  id: number;
  username: string;
  role: "super_admin" | "pt";
};

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as unknown,
  admin: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn() }));
vi.mock("@/services/admin-lock", () => ({
  canSeeHiddenUsers: vi.fn(async () => false),
}));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
  requireUser: vi.fn(async () => state.user),
  requireAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const actions = await import("@/features/social/services/social-actions");
const queries = await import("@/features/social/services/post-queries");
const mutations = await import("@/features/social/services/post-mutations");
const photos = await import("@/features/social/services/post-photos");
const cleanup = await import("@/features/social/services/post-cleanup");
const terms = await import("@/features/social/services/terms");
const upload = await import("@/app/api/social/photos/route");
const serve = await import("@/app/api/social/photos/[id]/route");

let db: TestDb;
let superId: number;
let ptA: number;
let ptB: number;
let alice: number; // PT A's trainee
let bob: number; // PT B's trainee
let carol: number; // no PT

const addAdmin = async (name: string, role: "pt" | "super_admin" | null) => {
  const [row] = await db
    .insert(admins)
    .values({ username: name, usernameKey: name, passwordHash: "x", role })
    .returning({ id: admins.id });

  return row.id;
};

const addUser = async (
  name: string,
  ptAdminId: number | null,
  termsVersion: number | null = TERMS_VERSION,
) => {
  const [row] = await db
    .insert(users)
    .values({ name, nameKey: name, ptAdminId, termsVersion })
    .returning({ id: users.id });

  return row.id;
};

const asUser = (
  id: number,
  name = "u",
  termsVersion: number | null = TERMS_VERSION,
) => {
  state.user = { id, name, termsVersion } satisfies TestUser;
  state.admin = null;
};
const asAdmin = (id: number, role: "super_admin" | "pt") => {
  state.user = null;
  state.admin = { id, username: "a", role } satisfies TestAdmin;
};

const insertPost = async (
  authorKind: "user" | "admin",
  authorId: number,
  privacy: "everyone" | "friends" | "only_me",
  caption = `${authorKind}${authorId}-${privacy}`,
) => {
  const now = new Date();
  const [row] = await db
    .insert(socialPosts)
    .values({
      authorKind,
      authorId,
      privacy,
      caption,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: socialPosts.id });

  return row.id;
};

const captions = (page: { posts: { caption: string }[] }) =>
  page.posts.map((post) => post.caption).sort();

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  superId = await addAdmin("root", null);
  ptA = await addAdmin("pta", "pt");
  ptB = await addAdmin("ptb", "pt");
  alice = await addUser("alice", ptA);
  bob = await addUser("bob", ptB);
  carol = await addUser("carol", null);
});

describe("terms gate", () => {
  it("knows who accepted the current version", () => {
    expect(terms.hasAcceptedTerms({ termsVersion: null })).toBe(false);
    expect(terms.hasAcceptedTerms({ termsVersion: TERMS_VERSION - 1 })).toBe(
      false,
    );
    expect(terms.hasAcceptedTerms({ termsVersion: TERMS_VERSION })).toBe(true);
  });

  it("stores version and time on accept", async () => {
    const dave = await addUser("dave", null, null);

    asUser(dave, "dave", null);
    expect(await actions.acceptTermsAction()).toEqual({ status: "success" });
    const [row] = await db.select().from(users).where(eq(users.id, dave));

    expect(row.termsVersion).toBe(TERMS_VERSION);
    expect(row.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it("refuses posting, editing, deleting, bio and paging before accepting", async () => {
    const dave = await addUser("dave", null, null);
    const id = await insertPost("user", dave, "everyone");

    asUser(dave, "dave", null);
    const input = { caption: "hi", privacy: "friends", photoId: null };
    const results = [
      await actions.createPostAction("user", input),
      await actions.editPostAction("user", {
        postId: id,
        caption: "x",
        privacy: "friends",
      }),
      await actions.deletePostAction("user", id),
      await actions.updateBioAction("user", "bio"),
      await actions.loadMorePostsAction("user", { type: "feed" }, 999),
    ];

    for (const result of results) {
      expect(result.status).toBe("error");
    }
    const rows = await db.select().from(socialPosts);

    expect(rows).toHaveLength(1);
    expect(rows[0].deletedAt).toBeNull();
  });

  it("refuses the photo upload before accepting", async () => {
    const dave = await addUser("dave", null, null);

    asUser(dave, "dave", null);
    const response = await upload.POST(
      new NextRequest("http://localhost/api/social/photos", {
        method: "POST",
        body: new Uint8Array(10),
      }),
    );

    expect(response.status).toBe(403);
  });
});

describe("create, edit and delete permissions", () => {
  it("creates a post, trims it and remembers the privacy", async () => {
    asUser(alice);
    const result = await actions.createPostAction("user", {
      caption: "  Hôm nay tập chân  ",
      privacy: "only_me",
      photoId: null,
    });

    expect(result.status).toBe("success");
    const [post] = await db.select().from(socialPosts);
    const [row] = await db.select().from(users).where(eq(users.id, alice));

    expect(post).toMatchObject({
      authorKind: "user",
      authorId: alice,
      caption: "Hôm nay tập chân",
      privacy: "only_me",
    });
    expect(row.postPrivacyDefault).toBe("only_me");
  });

  it("rejects an empty post, a long caption and a bad privacy", async () => {
    asUser(alice);
    for (const input of [
      { caption: "   ", privacy: "friends", photoId: null },
      { caption: "a".repeat(2001), privacy: "friends", photoId: null },
      { caption: "ok", privacy: "public", photoId: null },
      { caption: "ok", privacy: "friends", photoId: -1 },
      null,
    ]) {
      expect((await actions.createPostAction("user", input)).status).toBe(
        "error",
      );
    }
    expect(await db.select().from(socialPosts)).toHaveLength(0);
  });

  it("attaches only the uploader's own pending photo, once", async () => {
    const bytes = new Uint8Array(8);
    const mine = await photos.createPendingPostPhoto({
      uploaderKey: `user:${alice}`,
      mime: "image/png",
      width: 10,
      height: 10,
      bytes,
    });
    const theirs = await photos.createPendingPostPhoto({
      uploaderKey: `user:${bob}`,
      mime: "image/png",
      width: 10,
      height: 10,
      bytes,
    });

    asUser(alice);
    const stolen = await actions.createPostAction("user", {
      caption: "",
      privacy: "everyone",
      photoId: theirs,
    });

    expect(stolen.status).toBe("error");
    expect(await db.select().from(socialPosts)).toHaveLength(0);
    const ok = await actions.createPostAction("user", {
      caption: "",
      privacy: "everyone",
      photoId: mine,
    });

    expect(ok.status).toBe("success");
    const again = await actions.createPostAction("user", {
      caption: "",
      privacy: "everyone",
      photoId: mine,
    });

    expect(again.status).toBe("error");
    expect(await db.select().from(socialPosts)).toHaveLength(1);
  });

  it("lets only the author edit; the photo stays; a photo-only post keeps its photo", async () => {
    const id = await insertPost("user", alice, "friends");

    asUser(bob);
    expect(
      (
        await actions.editPostAction("user", {
          postId: id,
          caption: "hack",
          privacy: "everyone",
        })
      ).status,
    ).toBe("error");
    asAdmin(superId, "super_admin");
    expect(
      (
        await actions.editPostAction("admin", {
          postId: id,
          caption: "hack",
          privacy: "everyone",
        })
      ).status,
    ).toBe("error");
    asUser(alice);
    expect(
      (
        await actions.editPostAction("user", {
          postId: id,
          caption: "mới",
          privacy: "everyone",
        })
      ).status,
    ).toBe("success");
    const [post] = await db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.id, id));

    expect(post).toMatchObject({ caption: "mới", privacy: "everyone" });
    // Emptying the caption of a text post is refused.
    expect(
      (
        await actions.editPostAction("user", {
          postId: id,
          caption: " ",
          privacy: "everyone",
        })
      ).status,
    ).toBe("error");
  });

  it("lets the author or a super admin delete, nobody else, and drops the photo", async () => {
    const photoId = await photos.createPendingPostPhoto({
      uploaderKey: `user:${alice}`,
      mime: "image/png",
      width: 10,
      height: 10,
      bytes: new Uint8Array(8),
    });

    asUser(alice);
    await actions.createPostAction("user", {
      caption: "x",
      privacy: "everyone",
      photoId,
    });
    const [{ id }] = await db.select().from(socialPosts);

    asUser(bob);
    expect((await actions.deletePostAction("user", id)).status).toBe("error");
    asAdmin(ptA, "pt");
    expect((await actions.deletePostAction("admin", id)).status).toBe("error");
    expect(await db.select().from(socialPostPhotos)).toHaveLength(1);
    asAdmin(superId, "super_admin");
    expect((await actions.deletePostAction("admin", id)).status).toBe(
      "success",
    );
    const [post] = await db.select().from(socialPosts);

    expect(post.deletedAt).not.toBeNull();
    expect(await db.select().from(socialPostPhotos)).toHaveLength(0);
    // Already gone.
    expect((await actions.deletePostAction("admin", id)).status).toBe("error");
    const own = await insertPost("user", alice, "friends");

    asUser(alice);
    expect((await actions.deletePostAction("user", own)).status).toBe(
      "success",
    );
  });

  it("lets an admin post and edit as an admin", async () => {
    asAdmin(ptA, "pt");
    expect(
      (
        await actions.createPostAction("admin", {
          caption: "PT",
          privacy: "friends",
          photoId: null,
        })
      ).status,
    ).toBe("success");
    const [post] = await db.select().from(socialPosts);

    expect(post).toMatchObject({ authorKind: "admin", authorId: ptA });
    // A trainee with the same numeric id cannot touch it.
    asUser(ptA);
    expect(
      (
        await actions.editPostAction("user", {
          postId: post.id,
          caption: "x",
          privacy: "friends",
        })
      ).status,
    ).toBe("error");
  });

  it("saves the bio for trainee and admin, trimmed and limited", async () => {
    asUser(alice);
    expect((await actions.updateBioAction("user", "  khỏe  ")).status).toBe(
      "success",
    );
    expect(
      (await actions.updateBioAction("user", "a".repeat(151))).status,
    ).toBe("error");
    asAdmin(ptA, "pt");
    expect((await actions.updateBioAction("admin", "PT chính")).status).toBe(
      "success",
    );
    const [u] = await db.select().from(users).where(eq(users.id, alice));
    const [a] = await db.select().from(admins).where(eq(admins.id, ptA));

    expect(u.bio).toBe("khỏe");
    expect(a.bio).toBe("PT chính");
  });
});

describe("feed and profile queries", () => {
  beforeEach(async () => {
    await insertPost("user", alice, "everyone");
    await insertPost("user", alice, "friends");
    await insertPost("user", alice, "only_me");
    await insertPost("user", bob, "everyone");
    await insertPost("user", bob, "friends");
    await insertPost("admin", superId, "everyone");
    await insertPost("admin", superId, "friends");
    await insertPost("admin", superId, "only_me");
    await insertPost("admin", ptA, "friends");
    await insertPost("admin", ptA, "everyone");
  });

  it("builds a trainee's feed from own posts and the admins' reach", async () => {
    expect(captions(await queries.listUserFeed(alice))).toEqual(
      [
        "user" + alice + "-everyone",
        "user" + alice + "-friends",
        "user" + alice + "-only_me",
        "admin" + superId + "-everyone",
        "admin" + superId + "-friends",
        "admin" + ptA + "-everyone",
        "admin" + ptA + "-friends",
      ].sort(),
    );
  });

  it("does not show another PT's friends posts or strangers' posts", async () => {
    expect(captions(await queries.listUserFeed(bob))).toEqual(
      [
        "user" + bob + "-everyone",
        "user" + bob + "-friends",
        "admin" + superId + "-everyone",
        "admin" + superId + "-friends",
        "admin" + ptA + "-everyone",
      ].sort(),
    );
    // A trainee without a PT gets super admin posts only.
    expect(captions(await queries.listUserFeed(carol))).toEqual(
      [
        "admin" + superId + "-everyone",
        "admin" + superId + "-friends",
        "admin" + ptA + "-everyone",
      ].sort(),
    );
  });

  it("agrees with canSeePost for every post in the trainee feed", async () => {
    const { canSeePost } = await import("@/features/social/utils/visibility");

    for (const viewerId of [alice, bob, carol]) {
      const page = await queries.listUserFeed(viewerId);

      for (const post of page.posts) {
        const [viewerRow] = await db
          .select()
          .from(users)
          .where(eq(users.id, viewerId));
        const authorRow =
          post.authorKind === "user"
            ? (
                await db.select().from(users).where(eq(users.id, post.authorId))
              )[0]
            : null;
        const adminRow =
          post.authorKind === "admin"
            ? (
                await db
                  .select()
                  .from(admins)
                  .where(eq(admins.id, post.authorId))
              )[0]
            : null;

        expect(
          canSeePost(
            { kind: "user", id: viewerId },
            { kind: post.authorKind, id: post.authorId, privacy: post.privacy },
            {
              viewerPtAdminId: viewerRow.ptAdminId,
              authorPtAdminId: authorRow?.ptAdminId ?? null,
              authorRole: adminRow?.role === "pt" ? "pt" : "super_admin",
            },
          ),
        ).toBe(true);
      }
    }
  });

  it("filters a profile by what the viewer may see", async () => {
    const author = { kind: "user", id: alice } as const;

    expect(
      captions(
        await queries.listProfilePosts({ kind: "user", id: bob }, author),
      ),
    ).toEqual(["user" + alice + "-everyone"]);
    expect(
      (await queries.listProfilePosts({ kind: "user", id: alice }, author))
        .posts,
    ).toHaveLength(3);
    // The trainee's PT sees all, another PT only "everyone".
    expect(
      (
        await queries.listProfilePosts(
          { kind: "admin", id: ptA, role: "pt" },
          author,
        )
      ).posts,
    ).toHaveLength(3);
    expect(
      captions(
        await queries.listProfilePosts(
          { kind: "admin", id: ptB, role: "pt" },
          author,
        ),
      ),
    ).toEqual(["user" + alice + "-everyone"]);
    expect(
      (
        await queries.listProfilePosts(
          { kind: "admin", id: superId, role: "super_admin" },
          author,
        )
      ).posts,
    ).toHaveLength(3);
  });

  it("flags edit and delete rights per viewer", async () => {
    const own = await queries.listProfilePosts(
      { kind: "user", id: alice },
      { kind: "user", id: alice },
    );
    const asSuper = await queries.listProfilePosts(
      { kind: "admin", id: superId, role: "super_admin" },
      { kind: "user", id: alice },
    );

    expect(own.posts.every((post) => post.canEdit && post.canDelete)).toBe(
      true,
    );
    expect(asSuper.posts.every((post) => !post.canEdit && post.canDelete)).toBe(
      true,
    );
  });

  it("scopes the admin feed: super admin all, a PT own trainees and admins", async () => {
    const all = await queries.listAdminFeed({
      id: superId,
      role: "super_admin",
    });

    expect(all.posts).toHaveLength(10);
    const forPtA = await queries.listAdminFeed({ id: ptA, role: "pt" });

    expect(captions(forPtA)).toEqual(
      [
        "user" + alice + "-everyone",
        "user" + alice + "-friends",
        "user" + alice + "-only_me",
        "admin" + superId + "-everyone",
        "admin" + superId + "-friends",
        "admin" + ptA + "-everyone",
        "admin" + ptA + "-friends",
      ].sort(),
    );
    expect(
      forPtA.posts.some(
        (post) => post.authorId === bob && post.authorKind === "user",
      ),
    ).toBe(false);
  });

  it("hides posts of trainees the admin hid", async () => {
    const { adminHiddenUsers } = await import("@/db/schema");

    await db
      .insert(adminHiddenUsers)
      .values({ adminId: superId, userId: alice });
    const feed = await queries.listAdminFeed({
      id: superId,
      role: "super_admin",
    });

    expect(
      feed.posts.some(
        (post) => post.authorKind === "user" && post.authorId === alice,
      ),
    ).toBe(false);
    expect(feed.posts).toHaveLength(7);
  });

  it("skips deleted posts", async () => {
    const id = await insertPost("user", alice, "everyone", "gone");

    await db
      .update(socialPosts)
      .set({ deletedAt: new Date() })
      .where(eq(socialPosts.id, id));
    expect(captions(await queries.listUserFeed(alice))).not.toContain("gone");
  });

  it("pages with a cursor, newest first, without gaps or repeats", async () => {
    for (let i = 0; i < 45; i += 1) {
      await insertPost("user", carol, "everyone", `c${i}`);
    }
    const author = { kind: "user", id: carol } as const;
    const viewer = { kind: "user", id: bob } as const;
    const first = await queries.listProfilePosts(viewer, author);
    const second = await queries.listProfilePosts(
      viewer,
      author,
      first.nextCursor,
    );
    const third = await queries.listProfilePosts(
      viewer,
      author,
      second.nextCursor,
    );

    expect(first.posts).toHaveLength(20);
    expect(second.posts).toHaveLength(20);
    expect(third.posts).toHaveLength(5);
    expect(third.nextCursor).toBeNull();
    const ids = [...first.posts, ...second.posts, ...third.posts].map(
      (post) => post.id,
    );

    expect(new Set(ids).size).toBe(45);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it("loads more through the action for the signed-in viewer only", async () => {
    for (let i = 0; i < 25; i += 1) {
      await insertPost("user", carol, "everyone", `c${i}`);
    }
    asUser(bob);
    const first = await actions.loadMorePostsAction(
      "user",
      { type: "profile", kind: "user", id: carol },
      1_000_000,
    );

    expect(first.status).toBe("success");
    if (first.status === "success") {
      expect(first.page.posts).toHaveLength(20);
      expect(
        first.page.posts.every((post) => post.privacy === "everyone"),
      ).toBe(true);
    }
  });

  it("refuses an admin paging the profile of a trainee outside their workspace", async () => {
    asAdmin(ptA, "pt");
    await expect(
      actions.loadMorePostsAction(
        "admin",
        { type: "profile", kind: "user", id: bob },
        1_000_000,
      ),
    ).rejects.toThrow();
    const own = await actions.loadMorePostsAction(
      "admin",
      { type: "profile", kind: "user", id: alice },
      1_000_000,
    );

    expect(own.status).toBe("success");
  });
});

describe("photo serving guard", () => {
  const png = (() => {
    const bytes = new Uint8Array(40);

    bytes.set([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68,
      82, 0, 0, 0, 10, 0, 0, 0, 10,
    ]);
    return bytes;
  })();

  const makePhotoPost = async (
    authorKind: "user" | "admin",
    authorId: number,
    privacy: "everyone" | "friends" | "only_me",
  ) => {
    const photoId = await photos.createPendingPostPhoto({
      uploaderKey: `${authorKind}:${authorId}`,
      mime: "image/png",
      width: 10,
      height: 10,
      bytes: png,
    });
    const postId = await insertPost(authorKind, authorId, privacy);

    await db
      .update(socialPostPhotos)
      .set({ postId })
      .where(eq(socialPostPhotos.id, photoId));
    await db
      .update(socialPosts)
      .set({ photoId })
      .where(eq(socialPosts.id, postId));
    return { photoId, postId };
  };

  const get = (id: number | string) =>
    serve.GET(new NextRequest(`http://localhost/api/social/photos/${id}`), {
      params: Promise.resolve({ id: String(id) }),
    });

  it("serves a visible photo with private cache headers", async () => {
    const { photoId } = await makePhotoPost("user", alice, "everyone");

    asUser(bob);
    const response = await get(photoId);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toMatch(/^private/);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("answers 404 when the post is not visible to the viewer", async () => {
    const friends = await makePhotoPost("user", alice, "friends");
    const onlyMe = await makePhotoPost("user", alice, "only_me");

    asUser(bob);
    expect((await get(friends.photoId)).status).toBe(404);
    expect((await get(onlyMe.photoId)).status).toBe(404);
    asUser(alice);
    expect((await get(onlyMe.photoId)).status).toBe(200);
    asAdmin(ptB, "pt");
    expect((await get(friends.photoId)).status).toBe(404);
    asAdmin(ptA, "pt");
    expect((await get(onlyMe.photoId)).status).toBe(200);
    asAdmin(superId, "super_admin");
    expect((await get(onlyMe.photoId)).status).toBe(200);
  });

  it("serves an admin's friends photo to the right trainees only", async () => {
    const { photoId } = await makePhotoPost("admin", ptA, "friends");

    asUser(alice);
    expect((await get(photoId)).status).toBe(200);
    asUser(bob);
    expect((await get(photoId)).status).toBe(404);
  });

  it("answers 404 for pending, deleted and malformed ids and 401 signed out", async () => {
    const pending = await photos.createPendingPostPhoto({
      uploaderKey: `user:${alice}`,
      mime: "image/png",
      width: 10,
      height: 10,
      bytes: png,
    });
    const { photoId, postId } = await makePhotoPost("user", alice, "everyone");

    asUser(alice);
    expect((await get(pending)).status).toBe(404);
    expect((await get("abc")).status).toBe(404);
    expect((await get(9999)).status).toBe(404);
    await mutations.deletePost({ kind: "user", id: alice }, postId);
    expect((await get(photoId)).status).toBe(404);
    state.user = null;
    state.admin = null;
    expect((await get(photoId)).status).toBe(401);
  });

  it("rejects an upload that is not an image and accepts a valid one", async () => {
    asUser(alice);
    const bad = await upload.POST(
      new NextRequest("http://localhost/api/social/photos", {
        method: "POST",
        body: new Uint8Array(32),
      }),
    );

    expect(bad.status).toBe(400);
    const good = await upload.POST(
      new NextRequest("http://localhost/api/social/photos", {
        method: "POST",
        body: png,
      }),
    );

    expect(good.status).toBe(201);
    const tooBig = await upload.POST(
      new NextRequest("http://localhost/api/social/photos", {
        method: "POST",
        body: new Uint8Array(401 * 1024),
      }),
    );

    expect(tooBig.status).toBe(413);
  });
});

describe("member deletion cleanup", () => {
  it("removes the trainee's posts and photos, nobody else's", async () => {
    const photoId = await photos.createPendingPostPhoto({
      uploaderKey: `user:${alice}`,
      mime: "image/png",
      width: 10,
      height: 10,
      bytes: new Uint8Array(8),
    });
    const mine = await insertPost("user", alice, "everyone");

    await db
      .update(socialPostPhotos)
      .set({ postId: mine })
      .where(eq(socialPostPhotos.id, photoId));
    await photos.createPendingPostPhoto({
      uploaderKey: `user:${alice}`,
      mime: "image/png",
      width: 10,
      height: 10,
      bytes: new Uint8Array(8),
    });
    await insertPost("user", bob, "everyone");
    await insertPost("admin", alice, "everyone"); // an admin with the same number

    await cleanup.deleteSocialContentOfUser(db, alice);
    const left = await db.select().from(socialPosts);

    expect(
      left.map((post) => `${post.authorKind}:${post.authorId}`).sort(),
    ).toEqual([`admin:${alice}`, `user:${bob}`]);
    expect(await db.select().from(socialPostPhotos)).toHaveLength(0);
  });
});
