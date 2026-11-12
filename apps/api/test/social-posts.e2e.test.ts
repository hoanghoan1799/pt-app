import { SOCIAL_MESSAGES } from "@pt/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  befriend,
  count,
  createSocialWorld,
  destroySocialWorld,
  hide,
  PNG_1X1,
  revealHidden,
  social,
  type SocialWorld,
  unlockAdmin,
} from "./support/social.js";

let w: SocialWorld;
let api: ReturnType<typeof social>;

beforeAll(async () => {
  w = await createSocialWorld();
  api = social(w.app);
});

afterAll(async () => {
  await destroySocialWorld(w);
});

type Token = keyof SocialWorld["tokens"];

const createPost = async (
  who: Token,
  caption: string,
  privacy: "everyone" | "friends" | "only_me" = "everyone",
  extra: object = {},
) => {
  const response = await api.post("/posts", w.tokens[who], {
    caption,
    privacy,
    ...extra,
  });

  expect(response.status).toBe(201);
  return response.body.post.id as number;
};

const feedIds = async (who: Token) => {
  const response = await api.get("/feed?limit=50", w.tokens[who]);

  expect(response.status).toBe(200);
  return response.body.items.map((post: { id: number }) => post.id) as number[];
};

const status = async (path: string, who: Token) =>
  (await api.get(path, w.tokens[who])).status;

describe("sessions and the terms gate", () => {
  it("answers 401 without a session on every route", async () => {
    const routes: [string, string][] = [
      ["get", "/me"],
      ["post", "/me/terms"],
      ["get", "/feed"],
      ["post", "/posts"],
      ["get", "/posts/1"],
      ["patch", "/posts/1"],
      ["delete", "/posts/1"],
      ["get", "/profiles/user:1"],
      ["get", "/profiles/user:1/posts"],
      ["put", "/posts/1/reaction"],
      ["delete", "/posts/1/reaction"],
      ["get", "/posts/1/reactions"],
      ["get", "/posts/1/comments"],
      ["post", "/posts/1/comments"],
      ["patch", "/comments/1"],
      ["delete", "/comments/1"],
      ["get", "/people?email=a@b.co"],
      ["get", "/friends"],
      ["get", "/friends/requests"],
      ["post", "/friends/requests"],
      ["post", "/friends/requests/1/accept"],
      ["post", "/friends/requests/1/decline"],
      ["delete", "/friends/requests/1"],
      ["delete", "/friends/1"],
      ["get", "/blocks"],
      ["put", "/blocks/1"],
      ["delete", "/blocks/1"],
      ["post", "/reports"],
      ["get", "/reports"],
      ["post", "/reports/1/resolve"],
      ["get", "/notifications"],
      ["post", "/notifications/read"],
      ["get", "/photos/1"],
    ];

    for (const [method, path] of routes) {
      const response = await (
        api as unknown as Record<
          string,
          (path: string, token?: string) => Promise<{ status: number }>
        >
      )[method](path, undefined);

      expect(response.status, `${method} ${path}`).toBe(401);
    }
    expect((await api.upload(undefined, PNG_1X1)).status).toBe(401);
  });

  it("turns a trainee without the accepted terms away, admins never need them", async () => {
    const refused = await api.get("/feed", w.tokens.noTerms);

    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({
      code: "TERMS_REQUIRED",
      message: SOCIAL_MESSAGES.TERMS_REQUIRED,
    });
    for (const [method, path] of [
      ["post", "/posts"],
      ["get", "/notifications"],
      ["get", "/friends"],
      ["get", "/people?email=ann@example.com"],
      ["get", `/profiles/user:${w.ids.ann}`],
    ] as const) {
      const response = await api[method](path, w.tokens.noTerms);

      expect(response.status, `${method} ${path}`).toBe(403);
      expect(response.body.code).toBe("TERMS_REQUIRED");
    }
    expect((await api.upload(w.tokens.noTerms, PNG_1X1)).body.code).toBe(
      "TERMS_REQUIRED",
    );
    expect((await api.get("/feed", w.tokens.ptA)).status).toBe(200);
  });

  it("GET /me tells the terms state, the composer privacy and the unread count", async () => {
    const before = await api.get("/me", w.tokens.noTerms);

    expect(before.status).toBe(200);
    expect(before.body).toEqual({
      kind: "user",
      id: w.ids.noTerms,
      termsAccepted: false,
      termsVersion: 1,
      postPrivacyDefault: "friends",
      unreadNotifications: 0,
    });
    expect(
      (await api.get("/me", w.tokens.ptA)).body,
    ).toMatchObject({ kind: "admin", termsAccepted: true, postPrivacyDefault: "everyone" });
  });
});

describe("create, edit and delete", () => {
  it("creates a post, trims it, remembers the privacy and shows author facts", async () => {
    const response = await api.post("/posts", w.tokens.ann, {
      caption: "  Chạy bộ sáng nay  ",
      privacy: "everyone",
    });

    expect(response.status).toBe(201);
    expect(response.body.post).toMatchObject({
      authorKind: "user",
      authorId: w.ids.ann,
      authorName: "Ann",
      authorVerified: false,
      caption: "Chạy bộ sáng nay",
      privacy: "everyone",
      photo: null,
      edited: false,
      canEdit: true,
      canDelete: true,
      reactions: { counts: [], total: 0, mine: null },
      commentCount: 0,
    });
    expect(new Date(response.body.post.createdAt).toISOString()).toBe(
      response.body.post.createdAt,
    );
    expect((await api.get("/me", w.tokens.ann)).body.postPrivacyDefault).toBe(
      "everyone",
    );
    await w.ds.query(`UPDATE users SET post_privacy_default = 'friends' WHERE id = $1`, [
      w.ids.ann,
    ]);
  });

  it("rejects an empty post, a long caption and a bad privacy", async () => {
    const empty = await api.post("/posts", w.tokens.ann, {
      caption: "   ",
      privacy: "friends",
    });

    expect(empty.status).toBe(400);
    expect(empty.body).toMatchObject({
      code: "EMPTY_POST",
      message: SOCIAL_MESSAGES.EMPTY_POST,
    });

    const long = await api.post("/posts", w.tokens.ann, {
      caption: "a".repeat(2001),
      privacy: "friends",
    });

    expect(long.status).toBe(400);
    expect(long.body.code).toBe("VALIDATION_FAILED");
    expect(long.body.message).toContain(SOCIAL_MESSAGES.CAPTION_TOO_LONG);
    expect(
      (await api.post("/posts", w.tokens.ann, { caption: "x", privacy: "public" }))
        .status,
    ).toBe(400);
    expect((await api.post("/posts", w.tokens.ann, { privacy: "friends" })).status).toBe(
      400,
    );
  });

  it("accepts a caption of exactly 2000 characters", async () => {
    const id = await createPost("ann", "a".repeat(2000), "only_me");

    expect(id).toBeGreaterThan(0);
  });

  it("uploads a photo, attaches only the uploader's own pending photo once", async () => {
    const upload = await api.upload(w.tokens.ann, PNG_1X1);

    expect(upload.status).toBe(201);
    const photoId = upload.body.photo.id as number;

    // Another person cannot use it, and nothing is created.
    const before = await count(w.ds, `SELECT count(*)::int FROM social_posts`);
    const stolen = await api.post("/posts", w.tokens.ben, {
      caption: "mine now",
      privacy: "everyone",
      photoId,
    });

    expect(stolen.status).toBe(404);
    expect(stolen.body).toMatchObject({
      code: "PHOTO_NOT_FOUND",
      message: SOCIAL_MESSAGES.PHOTO_NOT_FOUND,
    });
    expect(await count(w.ds, `SELECT count(*)::int FROM social_posts`)).toBe(before);

    // A photo-only post is fine.
    const own = await api.post("/posts", w.tokens.ann, {
      caption: "",
      privacy: "everyone",
      photoId,
    });

    expect(own.status).toBe(201);
    expect(own.body.post.caption).toBe("");
    expect(own.body.post.photo).toEqual({
      id: photoId,
      url: `/v1/social/photos/${photoId}`,
      width: 1,
      height: 1,
    });

    // The same photo cannot be used twice.
    const again = await api.post("/posts", w.tokens.ann, {
      caption: "twice",
      privacy: "everyone",
      photoId,
    });

    expect(again.status).toBe(404);
    expect(again.body.code).toBe("PHOTO_NOT_FOUND");

    // A photo-only post keeps its photo when the caption is cleared.
    await w.clock.advance(60_000);
    const cleared = await api.patch(`/posts/${own.body.post.id}`, w.tokens.ann, {
      caption: "",
      privacy: "friends",
    });

    expect(cleared.status).toBe(204);
  });

  it("refuses a file that is not an image and one that is too large", async () => {
    const text = await api.upload(w.tokens.ann, Buffer.from("not an image at all"));

    expect(text.status).toBe(400);
    expect(text.body).toMatchObject({
      code: "BAD_IMAGE",
      message: SOCIAL_MESSAGES.PHOTO_BAD_IMAGE,
    });
    expect((await api.upload(w.tokens.ann, Buffer.alloc(0))).status).toBe(400);

    const big = await api.upload(
      w.tokens.ann,
      Buffer.concat([PNG_1X1, Buffer.alloc(450 * 1024)]),
    );

    expect(big.status).toBe(413);
    expect(big.body).toMatchObject({
      code: "PHOTO_TOO_LARGE",
      message: SOCIAL_MESSAGES.PHOTO_TOO_LARGE,
    });
  });

  it("lets only the author edit; the photo stays; empty text without a photo is refused", async () => {
    const id = await createPost("ann", "first", "everyone");

    for (const who of ["ben", "ptA", "superAdmin"] as const) {
      const response = await api.patch(`/posts/${id}`, w.tokens[who], {
        caption: "hacked",
        privacy: "everyone",
      });

      expect(response.status, who).toBe(403);
      expect(response.body.code).toBe("SOCIAL_FORBIDDEN");
    }
    w.clock.advance(60_000);
    expect(
      (
        await api.patch(`/posts/${id}`, w.tokens.ann, {
          caption: "  second  ",
          privacy: "only_me",
        })
      ).status,
    ).toBe(204);
    const view = (await api.get(`/posts/${id}`, w.tokens.ann)).body;

    expect(view).toMatchObject({
      caption: "second",
      privacy: "only_me",
      edited: true,
    });
    const refused = await api.patch(`/posts/${id}`, w.tokens.ann, {
      caption: " ",
      privacy: "only_me",
    });

    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("EMPTY_POST");
    expect(
      (await api.patch("/posts/999999", w.tokens.ann, { caption: "a", privacy: "friends" }))
        .status,
    ).toBe(404);
    expect(
      (await api.patch("/posts/abc", w.tokens.ann, { caption: "a", privacy: "friends" }))
        .status,
    ).toBe(400);
  });

  it("lets the author or a super admin delete, nobody else, and drops the photo and engagement", async () => {
    const photo = (await api.upload(w.tokens.ann, PNG_1X1)).body.photo.id;
    const id = await createPost("ann", "bye", "everyone", { photoId: photo });

    await api.put(`/posts/${id}/reaction`, w.tokens.ben, { emoji: "👍" });
    await api.post(`/posts/${id}/comments`, w.tokens.ben, { body: "nice" });
    expect(
      await count(w.ds, `SELECT count(*)::int FROM social_notifications WHERE post_id = $1`, [id]),
    ).toBe(2);

    for (const who of ["ben", "ptA"] as const) {
      expect((await api.delete(`/posts/${id}`, w.tokens[who])).status, who).toBe(403);
    }
    expect((await api.delete(`/posts/${id}`, w.tokens.ann)).status).toBe(204);

    expect(await status(`/posts/${id}`, "ann")).toBe(404);
    expect(await status(`/photos/${photo}`, "ann")).toBe(404);
    for (const table of ["social_reactions", "social_comments", "social_notifications"]) {
      expect(
        await count(w.ds, `SELECT count(*)::int FROM ${table} WHERE post_id = $1`, [id]),
      ).toBe(0);
    }
    expect(
      await count(w.ds, `SELECT count(*)::int FROM social_post_photos WHERE id = $1`, [photo]),
    ).toBe(0);
    expect((await api.delete(`/posts/${id}`, w.tokens.ann)).status).toBe(404);

    const other = await createPost("ben", "super admin may", "everyone");

    expect((await api.delete(`/posts/${other}`, w.tokens.superAdmin)).status).toBe(204);
  });

  it("lets an admin post as an admin", async () => {
    const response = await api.post("/posts", w.tokens.ptA, {
      caption: "Tuần này tập chân",
      privacy: "everyone",
    });

    expect(response.status).toBe(201);
    expect(response.body.post).toMatchObject({
      authorKind: "admin",
      authorId: w.ids.ptA,
      canEdit: true,
      canDelete: true,
    });
  });
});

describe("idempotent post creation", () => {
  it("returns the same post for the same key and actor, and creates nothing twice", async () => {
    const headers = { "Idempotency-Key": "retry-1" };
    const first = await api.post(
      "/posts",
      w.tokens.cat,
      { caption: "once", privacy: "friends" },
      headers,
    );
    const second = await api.post(
      "/posts",
      w.tokens.cat,
      { caption: "once", privacy: "friends" },
      headers,
    );

    expect(first.status).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body.post.id).toBe(first.body.post.id);
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM social_posts WHERE author_id = $1 AND caption = 'once'`,
        [w.ids.cat],
      ),
    ).toBe(1);
  });

  it("keeps keys per actor and survives parallel retries", async () => {
    const headers = { "Idempotency-Key": "shared-key" };
    const mine = await api.post("/posts", w.tokens.cat, { caption: "c", privacy: "friends" }, headers);
    const theirs = await api.post("/posts", w.tokens.ben, { caption: "b", privacy: "friends" }, headers);

    expect(theirs.body.post.id).not.toBe(mine.body.post.id);

    const racing = await Promise.all(
      [1, 2, 3, 4].map(() =>
        api.post(
          "/posts",
          w.tokens.ann,
          { caption: "race", privacy: "friends" },
          { "Idempotency-Key": "race-1" },
        ),
      ),
    );

    expect(new Set(racing.map((r) => r.body.post.id)).size).toBe(1);
    expect(racing.every((r) => r.status === 201)).toBe(true);
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM social_posts WHERE author_id = $1 AND idempotency_key = 'race-1'`,
        [w.ids.ann],
      ),
    ).toBe(1);
  });

  it("rejects a malformed key and still posts without one", async () => {
    for (const key of ["has space", "x".repeat(129)]) {
      const response = await api.post(
        "/posts",
        w.tokens.cat,
        { caption: "k", privacy: "friends" },
        { "Idempotency-Key": key },
      );

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("IDEMPOTENCY_KEY_INVALID");
    }
    const a = await createPost("cat", "no key", "friends");
    const b = await createPost("cat", "no key", "friends");

    expect(a).not.toBe(b);
  });

  it("does not notify twice when an admin post is replayed", async () => {
    const headers = { "Idempotency-Key": "admin-retry" };
    const body = { caption: "Thông báo", privacy: "everyone" };
    const first = await api.post("/posts", w.tokens.ptB, body, headers);
    const second = await api.post("/posts", w.tokens.ptB, body, headers);

    expect(second.body.post.id).toBe(first.body.post.id);
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM social_notifications WHERE post_id = $1`,
        [first.body.post.id],
      ),
    ).toBe(1);
  });
});

describe("privacy on the feed, the profile and the detail", () => {
  const ids = {} as Record<string, number>;

  beforeAll(async () => {
    ids.pub = await createPost("ann", "ann public", "everyone");
    ids.fri = await createPost("ann", "ann friends", "friends");
    ids.me = await createPost("ann", "ann only me", "only_me");
    ids.ptFriends = await createPost("ptA", "pt friends", "friends");
    ids.ptbFriends = await createPost("ptB", "ptb friends", "friends");
    ids.superFriends = await createPost("superAdmin", "super friends", "friends");
    ids.danFriends = await createPost("dan", "dan friends", "friends");
  });

  it("shows a stranger only the everyone post, on the profile and the detail", async () => {
    const profile = await api.get(`/profiles/user:${w.ids.ann}/posts`, w.tokens.ben);

    expect(profile.status).toBe(200);
    expect(profile.body.items.map((post: { id: number }) => post.id)).toContain(ids.pub);
    expect(profile.body.items.map((post: { id: number }) => post.id)).not.toContain(ids.fri);
    expect(profile.body.items.map((post: { id: number }) => post.id)).not.toContain(ids.me);
    expect(await status(`/posts/${ids.pub}`, "ben")).toBe(200);
    expect(await status(`/posts/${ids.fri}`, "ben")).toBe(404);
    expect(await status(`/posts/${ids.me}`, "ben")).toBe(404);
    expect(await feedIds("ben")).not.toContain(ids.pub);
  });

  it("a pending request opens nothing; an accepted friendship opens the friends post, never only_me", async () => {
    await w.ds.query(
      `INSERT INTO social_friendships (user_low, user_high, status, requested_by, created_at)
       VALUES ($1, $2, 'pending', $3, now())`,
      [Math.min(w.ids.ann, w.ids.ben), Math.max(w.ids.ann, w.ids.ben), w.ids.ben],
    );
    expect(await status(`/posts/${ids.fri}`, "ben")).toBe(404);
    expect(await feedIds("ben")).not.toContain(ids.pub);

    await w.ds.query(`DELETE FROM social_friendships`);
    await befriend(w.ds, w.ids.ann, w.ids.ben);

    expect(await status(`/posts/${ids.fri}`, "ben")).toBe(200);
    expect(await status(`/posts/${ids.me}`, "ben")).toBe(404);
    const feed = await feedIds("ben");

    expect(feed).toEqual(expect.arrayContaining([ids.pub, ids.fri]));
    expect(feed).not.toContain(ids.me);
    const profile = await api.get(`/profiles/user:${w.ids.ann}/posts`, w.tokens.ben);

    expect(profile.body.items.map((post: { id: number }) => post.id)).toEqual(
      expect.arrayContaining([ids.pub, ids.fri]),
    );
    expect(profile.body.items.map((post: { id: number }) => post.id)).not.toContain(ids.me);
    // The author sees all three, newest first.
    const own = await api.get(`/profiles/user:${w.ids.ann}/posts?limit=50`, w.tokens.ann);
    const ownIds = own.body.items.map((post: { id: number }) => post.id);

    expect(ownIds).toEqual(expect.arrayContaining([ids.pub, ids.fri, ids.me]));
    expect(ownIds).toEqual([...ownIds].sort((a, b) => b - a));
  });

  it("reaches trainees with the admins' friends posts of their own workspace only", async () => {
    const ann = await feedIds("ann");
    const dan = await feedIds("dan");

    expect(ann).toEqual(expect.arrayContaining([ids.ptFriends, ids.superFriends]));
    expect(ann).not.toContain(ids.ptbFriends);
    expect(dan).toEqual(expect.arrayContaining([ids.ptbFriends, ids.superFriends]));
    expect(dan).not.toContain(ids.ptFriends);
    // An everyone post of any admin reaches all trainees.
    const adminPublic = await createPost("ptB", "ptb public", "everyone");

    expect(await feedIds("ann")).toContain(adminPublic);
    expect(await status(`/posts/${ids.ptbFriends}`, "ann")).toBe(404);
    expect(await status(`/posts/${ids.ptFriends}`, "ann")).toBe(200);
  });

  it("gives admins their own scope: a PT sees own trainees (even only_me), a super admin everything", async () => {
    const pt = await feedIds("ptA");
    const ptB = await feedIds("ptB");
    const root = await feedIds("superAdmin");

    expect(pt).toEqual(expect.arrayContaining([ids.pub, ids.fri, ids.me, ids.ptFriends]));
    expect(pt).not.toContain(ids.danFriends);
    expect(ptB).toContain(ids.danFriends);
    expect(ptB).not.toContain(ids.me);
    expect(root).toEqual(
      expect.arrayContaining([ids.pub, ids.fri, ids.me, ids.danFriends, ids.ptbFriends]),
    );
    expect(await status(`/posts/${ids.me}`, "ptA")).toBe(200);
    expect(await status(`/posts/${ids.me}`, "ptB")).toBe(404);
    expect(await status(`/posts/${ids.me}`, "superAdmin")).toBe(200);
    expect(await status(`/posts/${ids.danFriends}`, "ptA")).toBe(404);
    // Another workspace's trainee profile does not exist for a PT.
    expect(await status(`/profiles/user:${w.ids.dan}`, "ptA")).toBe(404);
    expect(await status(`/profiles/user:${w.ids.dan}/posts`, "ptA")).toBe(404);
    expect(await status(`/profiles/user:${w.ids.ann}`, "ptA")).toBe(200);
  });

  it("hides the posts and the profile of trainees the admin hid, until that admin reveals", async () => {
    await unlockAdmin(w.app, w.tokens.ptP, "4321");
    const hidden = await createPost("pat", "pat's post", "everyone");

    expect(await feedIds("ptP")).toContain(hidden);
    await hide(w.ds, w.ids.ptP, w.ids.pat);

    expect(await feedIds("ptP")).not.toContain(hidden);
    expect(await status(`/posts/${hidden}`, "ptP")).toBe(404);
    expect(await status(`/profiles/user:${w.ids.pat}`, "ptP")).toBe(404);
    // Other admins are not affected.
    expect(await feedIds("superAdmin")).toContain(hidden);
    expect(await status(`/posts/${hidden}`, "superAdmin")).toBe(200);

    await revealHidden(w.app, w.tokens.ptP, "4321");
    expect(await feedIds("ptP")).toContain(hidden);
    expect(await status(`/posts/${hidden}`, "ptP")).toBe(200);
    expect(await status(`/profiles/user:${w.ids.pat}`, "ptP")).toBe(200);
  });

  it("hides everything both ways once either side blocked the other, except from admins", async () => {
    await w.ds.query(
      `INSERT INTO social_blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, now())`,
      [w.ids.ben, w.ids.ann],
    );
    expect(await status(`/posts/${ids.pub}`, "ben")).toBe(404);
    expect(await feedIds("ben")).not.toContain(ids.pub);
    expect(await status(`/profiles/user:${w.ids.ann}`, "ben")).toBe(404);
    expect(await status(`/profiles/user:${w.ids.ann}/posts`, "ben")).toBe(404);

    const benPost = await createPost("ben", "ben public", "everyone");

    expect(await status(`/posts/${benPost}`, "ann")).toBe(404);
    expect(await feedIds("ann")).not.toContain(benPost);
    expect(await status(`/profiles/user:${w.ids.ben}`, "ann")).toBe(404);
    // A third person is unaffected; admins still see both.
    expect(await status(`/posts/${ids.pub}`, "cat")).toBe(200);
    expect(await status(`/posts/${benPost}`, "ptA")).toBe(200);
    expect(await status(`/posts/${ids.pub}`, "superAdmin")).toBe(200);

    await w.ds.query(`DELETE FROM social_blocks`);
  });
});

describe("cursor pagination", () => {
  it("pages newest first without gaps or repeats, even when a post arrives between pages", async () => {
    const mine: number[] = [];

    for (let i = 0; i < 7; i += 1) {
      mine.push(await createPost("cat", `cat ${i}`, "only_me"));
    }
    const first = await api.get("/feed?limit=3", w.tokens.cat);

    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(3);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    // A new post arrives after the first page was read.
    const arrived = await createPost("cat", "late", "only_me");
    const seen: number[] = first.body.items.map((post: { id: number }) => post.id);
    let cursor: string | null = first.body.nextCursor;

    while (cursor) {
      const page = await api.get(
        `/feed?limit=3&cursor=${encodeURIComponent(cursor)}`,
        w.tokens.cat,
      );

      expect(page.status).toBe(200);
      seen.push(...page.body.items.map((post: { id: number }) => post.id));
      cursor = page.body.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).not.toContain(arrived);
    expect(seen).toEqual([...seen].sort((a, b) => b - a));
    expect(seen).toEqual(expect.arrayContaining(mine));
  });

  it("filters privacy on every page and rejects a tampered cursor", async () => {
    const profile = await api.get(`/profiles/user:${w.ids.cat}/posts?limit=2`, w.tokens.dan);
    const pages: number[] = [];
    const cursor: string | null = profile.body.nextCursor;

    expect(profile.body.items).toEqual([]);
    expect(cursor).toBeNull();
    pages.push(profile.body.items.length);

    for (const bad of ["not-a-cursor", Buffer.from("[0]").toString("base64url"), "e30"]) {
      const response = await api.get(`/feed?cursor=${bad}`, w.tokens.cat);

      expect(response.status, bad).toBe(400);
      expect(response.body.code).toBe("VALIDATION_FAILED");
    }
    expect((await api.get("/feed?limit=0", w.tokens.cat)).status).toBe(400);
    expect((await api.get("/feed?limit=51", w.tokens.cat)).status).toBe(400);
  });
});

describe("photo serving", () => {
  it("serves a visible photo with private cache headers and 404s for everyone else", async () => {
    const photo = (await api.upload(w.tokens.ann, PNG_1X1)).body.photo.id as number;

    // Pending: visible to no one.
    expect(await status(`/photos/${photo}`, "ann")).toBe(404);
    const post = await createPost("ann", "with photo", "friends", { photoId: photo });
    const ok = await api.get(`/photos/${photo}`, w.tokens.ann);

    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toBe("image/png");
    expect(ok.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
    expect(ok.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(ok.body).equals(PNG_1X1)).toBe(true);

    // Friends photo: a friend, the PT and the super admin; not a stranger or the other PT.
    expect(await status(`/photos/${photo}`, "ben")).toBe(200);
    expect(await status(`/photos/${photo}`, "ptA")).toBe(200);
    expect(await status(`/photos/${photo}`, "superAdmin")).toBe(200);
    expect(await status(`/photos/${photo}`, "cat")).toBe(404);
    expect(await status(`/photos/${photo}`, "ptB")).toBe(404);
    expect(await status(`/photos/${photo}`, "dan")).toBe(404);
    expect(await status("/photos/999999", "ann")).toBe(404);
    expect(await status("/photos/abc", "ann")).toBe(400);

    await api.delete(`/posts/${post}`, w.tokens.ann);
    expect(await status(`/photos/${photo}`, "ann")).toBe(404);
  });
});

describe("accepting the terms", () => {
  it("opens the social routes for the trainee afterwards", async () => {
    expect((await api.post("/me/terms", w.tokens.noTerms)).status).toBe(204);
    expect(
      await count(
        w.ds,
        `SELECT terms_version AS count FROM users WHERE id = $1`,
        [w.ids.noTerms],
      ),
    ).toBe(1);
    expect((await api.get("/feed", w.tokens.noTerms)).status).toBe(200);
    expect((await api.get("/me", w.tokens.noTerms)).body.termsAccepted).toBe(true);
  });
});
