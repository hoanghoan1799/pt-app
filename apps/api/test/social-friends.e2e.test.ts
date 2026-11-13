import { SOCIAL_FRIEND_MESSAGES } from "@pt/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  befriend,
  count,
  createSocialWorld,
  destroySocialWorld,
  social,
  type SocialWorld,
} from "./support/social.js";
import { seedCompletion, seedSets, seedWorkout } from "./support/workouts.js";

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

const emailOf = async (id: number) =>
  (await w.ds.query(`SELECT email FROM users WHERE id = $1`, [id]))[0]
    .email as string;

const friendship = async (a: number, b: number) =>
  (
    await w.ds.query(
      `SELECT status, requested_by, accepted_at FROM social_friendships
       WHERE user_low = $1 AND user_high = $2`,
      [Math.min(a, b), Math.max(a, b)],
    )
  )[0] as
    | { status: string; requested_by: number; accepted_at: Date | null }
    | undefined;

const notificationKinds = async (recipientId: number, actorId?: number) =>
  (
    await w.ds.query(
      `SELECT kind FROM social_notifications
       WHERE recipient_key = $1 AND ($2::text IS NULL OR actor_key = $2)
       ORDER BY id`,
      [`user:${recipientId}`, actorId ? `user:${actorId}` : null],
    )
  ).map((row: { kind: string }) => row.kind);

const reset = async () => {
  await w.ds.query(`DELETE FROM social_friendships`);
  await w.ds.query(`DELETE FROM social_blocks`);
  await w.ds.query(`DELETE FROM social_notifications`);
  await w.ds.query(`DELETE FROM rate_limits`);
};

describe("access", () => {
  it("is for trainees only", async () => {
    for (const path of ["/friends", "/friends/requests", "/blocks"]) {
      for (const who of ["ptA", "superAdmin"] as const) {
        const response = await api.get(path, w.tokens[who]);

        expect(response.status, `${who} ${path}`).toBe(403);
      }
    }
    expect((await api.get("/people?email=a@b.co", w.tokens.ptA)).status).toBe(
      403,
    );
    expect(
      (await api.post("/friends/requests", w.tokens.ptA, { userId: w.ids.ann }))
        .status,
    ).toBe(403);
    expect((await api.put(`/blocks/${w.ids.ann}`, w.tokens.ptA)).status).toBe(
      403,
    );
  });

  it("validates ids", async () => {
    expect(
      (await api.post("/friends/requests", w.tokens.ann, { userId: "x" }))
        .status,
    ).toBe(400);
    expect((await api.post("/friends/requests", w.tokens.ann, {})).status).toBe(
      400,
    );
    expect((await api.put("/blocks/0", w.tokens.ann)).status).toBe(400);
    expect((await api.delete("/friends/abc", w.tokens.ann)).status).toBe(400);
  });
});

describe("email search", () => {
  beforeAll(reset);

  it("finds a trainee by the full email, trimmed and case-insensitive, with the relationship", async () => {
    const email = await emailOf(w.ids.ben);
    const found = await api.get(
      `/people?email=${encodeURIComponent(`  ${email.toUpperCase()}  `)}`,
      w.tokens.ann,
    );

    expect(found.status).toBe(200);
    expect(found.body.result).toEqual({
      id: w.ids.ben,
      name: "Ben",
      avatarUrl: null,
      relationship: "none",
    });
    await api.post("/friends/requests", w.tokens.ann, { userId: w.ids.ben });
    const sent = await api.get(
      `/people?email=${encodeURIComponent(email)}`,
      w.tokens.ann,
    );
    const received = await api.get(
      `/people?email=${encodeURIComponent(await emailOf(w.ids.ann))}`,
      w.tokens.ben,
    );

    expect(sent.body.result.relationship).toBe("sent");
    expect(received.body.result.relationship).toBe("received");
    await api.post(`/friends/requests/${w.ids.ann}/accept`, w.tokens.ben);
    expect(
      (
        await api.get(
          `/people?email=${encodeURIComponent(email)}`,
          w.tokens.ann,
        )
      ).body.result.relationship,
    ).toBe("friends");
    await reset();
  });

  it("never matches a prefix or a fragment, and refuses a half-typed email", async () => {
    const email = await emailOf(w.ids.ben);
    const [local] = email.split("@");

    for (const partial of [
      local,
      email.slice(0, -4),
      "@example.com",
      `${local}@`,
    ]) {
      const response = await api.get(
        `/people?email=${encodeURIComponent(partial)}`,
        w.tokens.ann,
      );

      expect(response.status, partial).toBe(400);
      expect(response.body).toMatchObject({
        code: "EMAIL_INVALID",
        message: SOCIAL_FRIEND_MESSAGES.EMAIL_INVALID,
      });
    }
    // A wildcard is not an address; in an address it matches nobody.
    const pattern = await api.get(
      `/people?email=${encodeURIComponent("%@example.com")}`,
      w.tokens.ann,
    );

    expect(pattern.status).toBe(400);
    const wild = await api.get(
      `/people?email=${encodeURIComponent("trainee_@example.com")}`,
      w.tokens.ann,
    );

    expect(wild.status).toBe(200);
    expect(wild.body.result).toBeNull();
    expect((await api.get("/people", w.tokens.ann)).status).toBe(400);
  });

  it("returns nothing for yourself, unknown emails, trainees without terms and blocked people", async () => {
    const none = async (email: string, who: Token = "ann") =>
      (
        await api.get(
          `/people?email=${encodeURIComponent(email)}`,
          w.tokens[who],
        )
      ).body.result;

    expect(await none(await emailOf(w.ids.ann))).toBeNull();
    expect(await none("nobody@example.com")).toBeNull();
    expect(await none(await emailOf(w.ids.noTerms))).toBeNull();

    await w.ds.query(
      `INSERT INTO social_blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, now())`,
      [w.ids.ben, w.ids.ann],
    );
    expect(await none(await emailOf(w.ids.ben))).toBeNull();
    expect(await none(await emailOf(w.ids.ann), "ben")).toBeNull();
    await reset();
  });

  it("shows the searcher's own nickname for the person", async () => {
    await w.ds.query(
      `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at) VALUES ($1, $2, 'Bạn Ben', now())`,
      [`user:${w.ids.ann}`, `user:${w.ids.ben}`],
    );
    const found = await api.get(
      `/people?email=${encodeURIComponent(await emailOf(w.ids.ben))}`,
      w.tokens.ann,
    );

    expect(found.body.result.name).toBe("Bạn Ben");
    await w.ds.query(`DELETE FROM contact_aliases`);
  });
});

describe("friend request lifecycle", () => {
  beforeAll(reset);

  it("send, accept: one row per pair and a notification each way", async () => {
    const sent = await api.post("/friends/requests", w.tokens.ben, {
      userId: w.ids.ann,
    });

    expect(sent.status).toBe(201);
    expect(sent.body).toEqual({ accepted: false });
    expect(await friendship(w.ids.ann, w.ids.ben)).toMatchObject({
      status: "pending",
      requested_by: w.ids.ben,
    });
    expect(await notificationKinds(w.ids.ann, w.ids.ben)).toEqual([
      "friend_request",
    ]);

    const requests = (await api.get("/friends/requests", w.tokens.ann)).body;

    expect(requests.received).toEqual([
      { id: w.ids.ben, name: "Ben", avatarUrl: null },
    ]);
    expect(requests.sent).toEqual([]);
    expect(
      (await api.get("/friends/requests", w.tokens.ben)).body.sent,
    ).toEqual([{ id: w.ids.ann, name: "Ann", avatarUrl: null }]);

    const again = await api.post("/friends/requests", w.tokens.ben, {
      userId: w.ids.ann,
    });

    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({
      code: "ALREADY_REQUESTED",
      message: SOCIAL_FRIEND_MESSAGES.ALREADY_REQUESTED,
    });

    expect(
      (await api.post(`/friends/requests/${w.ids.ben}/accept`, w.tokens.ann))
        .status,
    ).toBe(204);
    const row = await friendship(w.ids.ann, w.ids.ben);

    expect(row?.status).toBe("accepted");
    expect(row?.accepted_at).toBeInstanceOf(Date);
    expect(
      await count(w.ds, `SELECT count(*)::int FROM social_friendships`),
    ).toBe(1);
    // The request is answered: gone from my list; the requester is told.
    expect(await notificationKinds(w.ids.ann, w.ids.ben)).toEqual([]);
    expect(await notificationKinds(w.ids.ben, w.ids.ann)).toEqual([
      "friend_accepted",
    ]);

    const friends = await api.get("/friends", w.tokens.ben);

    expect(friends.body.items).toEqual([
      { id: w.ids.ann, name: "Ann", avatarUrl: null },
    ]);
    expect((await api.get("/friends/requests", w.tokens.ann)).body).toEqual({
      received: [],
      sent: [],
    });
  });

  it("refuses duplicates between friends, accepting twice and unknown requests", async () => {
    for (const [who, other] of [
      ["ann", w.ids.ben],
      ["ben", w.ids.ann],
    ] as const) {
      const response = await api.post("/friends/requests", w.tokens[who], {
        userId: other,
      });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: "ALREADY_FRIENDS",
        message: SOCIAL_FRIEND_MESSAGES.ALREADY_FRIENDS,
      });
    }
    const accept = await api.post(
      `/friends/requests/${w.ids.ben}/accept`,
      w.tokens.ann,
    );

    expect(accept.status).toBe(404);
    expect(accept.body).toMatchObject({
      code: "USER_NOT_FOUND",
      message: SOCIAL_FRIEND_MESSAGES.NOT_FOUND,
    });
  });

  it("refuses yourself, unknown people, trainees without terms and blocked people", async () => {
    await w.ds.query(
      `INSERT INTO social_blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, now())`,
      [w.ids.cat, w.ids.dan],
    );
    for (const [who, target] of [
      ["ann", w.ids.ann],
      ["ann", 999999],
      ["ann", w.ids.noTerms],
      ["cat", w.ids.dan],
      ["dan", w.ids.cat],
    ] as const) {
      const response = await api.post("/friends/requests", w.tokens[who], {
        userId: target,
      });

      expect(response.status, `${who} -> ${target}`).toBe(404);
      expect(response.body.code).toBe("USER_NOT_FOUND");
    }
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM social_friendships WHERE status = 'pending'`,
      ),
    ).toBe(0);
    await w.ds.query(`DELETE FROM social_blocks`);
  });

  it("only the one who was asked can accept or decline; declining lets a new request in", async () => {
    await api.post("/friends/requests", w.tokens.ann, { userId: w.ids.cat });

    // The asker cannot accept their own request, a third person cannot touch it.
    expect(
      (await api.post(`/friends/requests/${w.ids.cat}/accept`, w.tokens.ann))
        .status,
    ).toBe(404);
    expect(
      (await api.post(`/friends/requests/${w.ids.ann}/accept`, w.tokens.ben))
        .status,
    ).toBe(404);
    expect(
      (await api.post(`/friends/requests/${w.ids.ann}/decline`, w.tokens.ben))
        .status,
    ).toBe(404);
    expect((await friendship(w.ids.ann, w.ids.cat))?.status).toBe("pending");

    expect(
      (await api.post(`/friends/requests/${w.ids.ann}/decline`, w.tokens.cat))
        .status,
    ).toBe(204);
    expect(await friendship(w.ids.ann, w.ids.cat)).toBeUndefined();
    expect(await notificationKinds(w.ids.cat, w.ids.ann)).toEqual([]);

    const resent = await api.post("/friends/requests", w.tokens.ann, {
      userId: w.ids.cat,
    });

    expect(resent.status).toBe(201);
    // A repeated request replaces the earlier notification.
    expect(await notificationKinds(w.ids.cat, w.ids.ann)).toEqual([
      "friend_request",
    ]);
  });

  it("cancel removes my own request and its notification, not theirs", async () => {
    // ann -> cat is pending from the test above.
    expect(
      (await api.delete(`/friends/requests/${w.ids.ann}`, w.tokens.cat)).status,
    ).toBe(404);
    expect((await friendship(w.ids.ann, w.ids.cat))?.status).toBe("pending");
    expect(
      (await api.delete(`/friends/requests/${w.ids.cat}`, w.tokens.ann)).status,
    ).toBe(204);
    expect(await friendship(w.ids.ann, w.ids.cat)).toBeUndefined();
    expect(await notificationKinds(w.ids.cat, w.ids.ann)).toEqual([]);
    expect(
      (await api.delete(`/friends/requests/${w.ids.cat}`, w.tokens.ann)).status,
    ).toBe(404);
  });

  it("asking someone who already asked me accepts at once", async () => {
    await api.post("/friends/requests", w.tokens.dan, { userId: w.ids.cat });
    const back = await api.post("/friends/requests", w.tokens.cat, {
      userId: w.ids.dan,
    });

    expect(back.status).toBe(201);
    expect(back.body).toEqual({ accepted: true });
    expect((await friendship(w.ids.cat, w.ids.dan))?.status).toBe("accepted");
    expect(await notificationKinds(w.ids.dan, w.ids.cat)).toEqual([
      "friend_accepted",
    ]);
    expect(await notificationKinds(w.ids.cat, w.ids.dan)).toEqual([]);
  });

  it("unfriend deletes an accepted friendship only", async () => {
    await api.post("/friends/requests", w.tokens.ben, { userId: w.ids.cat });

    // Pending is not a friendship.
    expect(
      (await api.delete(`/friends/${w.ids.cat}`, w.tokens.ben)).status,
    ).toBe(404);
    expect(
      (await api.delete(`/friends/${w.ids.dan}`, w.tokens.cat)).status,
    ).toBe(204);
    expect(await friendship(w.ids.cat, w.ids.dan)).toBeUndefined();
    expect(
      (await api.delete(`/friends/${w.ids.dan}`, w.tokens.cat)).status,
    ).toBe(404);
  });

  it("limits requests to 20 a day and starts over the next day", async () => {
    await reset();
    await w.ds.query(
      `INSERT INTO rate_limits (key, count, window_started_at) VALUES ($1, 20, $2)`,
      [`friend-request:${w.ids.ann}`, w.clock.now()],
    );
    const limited = await api.post("/friends/requests", w.tokens.ann, {
      userId: w.ids.ben,
    });

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      code: "FRIEND_REQUEST_RATE_LIMITED",
      message: SOCIAL_FRIEND_MESSAGES.RATE_LIMITED,
    });
    expect(await friendship(w.ids.ann, w.ids.ben)).toBeUndefined();
    // Someone else is not affected.
    expect(
      (await api.post("/friends/requests", w.tokens.cat, { userId: w.ids.ben }))
        .status,
    ).toBe(201);

    w.clock.advance(24 * 60 * 60 * 1000 + 1000);
    expect(
      (await api.post("/friends/requests", w.tokens.ann, { userId: w.ids.ben }))
        .status,
    ).toBe(201);
    await reset();
  });
});

describe("block", () => {
  beforeAll(reset);

  it("ends the friendship, a pending request and the friend notifications; twice is harmless", async () => {
    await api.post("/friends/requests", w.tokens.ann, { userId: w.ids.ben });
    await api.post(`/friends/requests/${w.ids.ann}/accept`, w.tokens.ben);
    expect(await notificationKinds(w.ids.ann, w.ids.ben)).toEqual([
      "friend_accepted",
    ]);

    expect((await api.put(`/blocks/${w.ids.ann}`, w.tokens.ben)).status).toBe(
      204,
    );
    expect((await api.put(`/blocks/${w.ids.ann}`, w.tokens.ben)).status).toBe(
      204,
    );
    expect(await friendship(w.ids.ann, w.ids.ben)).toBeUndefined();
    expect(await notificationKinds(w.ids.ann, w.ids.ben)).toEqual([]);
    expect(await notificationKinds(w.ids.ben, w.ids.ann)).toEqual([]);
    expect(await count(w.ds, `SELECT count(*)::int FROM social_blocks`)).toBe(
      1,
    );

    // A pending request is cleared as well.
    await api.post("/friends/requests", w.tokens.cat, { userId: w.ids.dan });
    await api.put(`/blocks/${w.ids.cat}`, w.tokens.dan);
    expect(await friendship(w.ids.cat, w.ids.dan)).toBeUndefined();
    expect(await notificationKinds(w.ids.dan, w.ids.cat)).toEqual([]);
  });

  it("refuses blocking yourself or an unknown id", async () => {
    for (const target of [w.ids.ben, 999999]) {
      const response = await api.put(`/blocks/${target}`, w.tokens.ben);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("USER_NOT_FOUND");
    }
  });

  it("keeps the blocked pair from befriending, searching and listing each other", async () => {
    const asked = await api.post("/friends/requests", w.tokens.ann, {
      userId: w.ids.ben,
    });

    expect(asked.status).toBe(404);
    expect(
      (await api.post("/friends/requests", w.tokens.ben, { userId: w.ids.ann }))
        .status,
    ).toBe(404);
    expect((await api.get("/friends", w.tokens.ann)).body.items).toEqual([]);
  });

  it("lists only the people I blocked; only the blocker lifts it and the friendship stays gone", async () => {
    expect((await api.get("/blocks", w.tokens.ben)).body.items).toEqual([
      { id: w.ids.ann, name: "Ann", avatarUrl: null },
    ]);
    expect((await api.get("/blocks", w.tokens.ann)).body.items).toEqual([]);
    expect(
      (await api.delete(`/blocks/${w.ids.ben}`, w.tokens.ann)).status,
    ).toBe(404);
    expect(
      (await api.delete(`/blocks/${w.ids.ann}`, w.tokens.ben)).status,
    ).toBe(204);
    expect((await api.get("/blocks", w.tokens.ben)).body.items).toEqual([]);
    expect(await friendship(w.ids.ann, w.ids.ben)).toBeUndefined();
    expect(
      (await api.delete(`/blocks/${w.ids.ann}`, w.tokens.ben)).status,
    ).toBe(404);
  });

  it("does not affect admins", async () => {
    await api.put(`/blocks/${w.ids.ann}`, w.tokens.ben);
    const post = (
      await api.post("/posts", w.tokens.ann, {
        caption: "visible to staff",
        privacy: "everyone",
      })
    ).body.post.id;

    expect((await api.get(`/posts/${post}`, w.tokens.ptA)).status).toBe(200);
    expect((await api.get(`/posts/${post}`, w.tokens.superAdmin)).status).toBe(
      200,
    );
    expect((await api.get(`/posts/${post}`, w.tokens.ben)).status).toBe(404);
  });
});

describe("profiles", () => {
  beforeAll(reset);

  it("shows who the person is, how I relate to them, and their friend count", async () => {
    await befriend(w.ds, w.ids.ann, w.ids.ben);
    await w.ds.query(`UPDATE users SET bio = 'Chạy mỗi ngày' WHERE id = $1`, [
      w.ids.ben,
    ]);
    await w.ds.query(
      `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at) VALUES ($1, $2, 'Bạn Ben', now())`,
      [`user:${w.ids.ann}`, `user:${w.ids.ben}`],
    );
    const profile = await api.get(`/profiles/user:${w.ids.ben}`, w.tokens.ann);

    expect(profile.status).toBe(200);
    expect(profile.body).toEqual({
      kind: "user",
      id: w.ids.ben,
      name: "Bạn Ben",
      realName: "Ben",
      alias: "Bạn Ben",
      avatarUrl: null,
      verified: false,
      bio: "Chạy mỗi ngày",
      role: "trainee",
      isOwn: false,
      relationship: "friends",
      friendCount: 1,
      stats: { workouts: 0, streak: 0, totalSets: 0 },
      canBlock: true,
      canReport: true,
      composerPrivacy: null,
    });
    await w.ds.query(`DELETE FROM contact_aliases`);
  });

  it("shows training stats to the owner, a friend and admins, not to a stranger", async () => {
    const day1 = await seedWorkout(w.ds, w.ids.ben, "2026-11-11");
    const day2 = await seedWorkout(w.ds, w.ids.ben, "2026-11-12");

    await seedCompletion(w.ds, day1.exerciseId, w.ids.ben);
    await seedCompletion(w.ds, day2.exerciseId, w.ids.ben);
    await seedSets(w.ds, day1.exerciseId, w.ids.ben, [
      { weightKg: 50, reps: 5 },
      { weightKg: 50, reps: 5 },
      { weightKg: null, reps: 12 },
    ]);
    const stats = async (who: Token) =>
      (await api.get(`/profiles/user:${w.ids.ben}`, w.tokens[who])).body.stats;

    for (const who of ["ben", "ann", "ptA", "superAdmin"] as const) {
      expect(await stats(who), who).toEqual({
        workouts: 2,
        streak: 2,
        totalSets: 3,
      });
    }
    expect(await stats("cat")).toBeNull();
    expect(
      (await api.get(`/profiles/user:${w.ids.ben}`, w.tokens.ptB)).status,
    ).toBe(404);
  });

  it("flags a pending request, own profile and the composer privacy", async () => {
    await api.post("/friends/requests", w.tokens.cat, { userId: w.ids.ann });

    expect(
      (await api.get(`/profiles/user:${w.ids.ann}`, w.tokens.cat)).body
        .relationship,
    ).toBe("sent");
    expect(
      (await api.get(`/profiles/user:${w.ids.cat}`, w.tokens.ann)).body
        .relationship,
    ).toBe("received");
    const own = (await api.get(`/profiles/user:${w.ids.ann}`, w.tokens.ann))
      .body;

    expect(own).toMatchObject({
      isOwn: true,
      relationship: null,
      canBlock: false,
      canReport: false,
      // The privacy of the last post ann made in this file.
      composerPrivacy: "everyone",
    });
  });

  it("shows an admin's profile with role and verified tick, and the admin view of a trainee", async () => {
    await w.ds.query(
      `UPDATE admins SET verified_at = now(), bio = 'Huấn luyện viên' WHERE id = $1`,
      [w.ids.ptA],
    );
    const admin = (await api.get(`/profiles/admin:${w.ids.ptA}`, w.tokens.ann))
      .body;

    expect(admin).toMatchObject({
      kind: "admin",
      id: w.ids.ptA,
      role: "pt",
      verified: true,
      bio: "Huấn luyện viên",
      relationship: null,
      friendCount: null,
      stats: null,
      canBlock: false,
      canReport: false,
    });
    const own = (await api.get(`/profiles/admin:${w.ids.ptA}`, w.tokens.ptA))
      .body;

    expect(own).toMatchObject({ isOwn: true, composerPrivacy: "everyone" });
    const asAdmin = (await api.get(`/profiles/user:${w.ids.ann}`, w.tokens.ptA))
      .body;

    expect(asAdmin).toMatchObject({
      relationship: null,
      canBlock: false,
      canReport: true,
    });
    expect(
      (await api.get(`/profiles/admin:${w.ids.superAdmin}`, w.tokens.ptA)).body
        .role,
    ).toBe("super_admin");
  });

  it("answers 404 for a missing account and 400 for a malformed key", async () => {
    expect((await api.get("/profiles/user:999999", w.tokens.ann)).status).toBe(
      404,
    );
    expect((await api.get("/profiles/admin:999999", w.tokens.ann)).status).toBe(
      404,
    );
    expect(
      (await api.get("/profiles/user:999999", w.tokens.ann)).body.code,
    ).toBe("PROFILE_NOT_FOUND");
    for (const key of ["user:0", "user:abc", "nobody:1", "user"]) {
      expect(
        (await api.get(`/profiles/${key}`, w.tokens.ann)).status,
        key,
      ).toBe(400);
    }
  });
});

describe("reports", () => {
  let post: number;
  let comment: number;

  beforeAll(async () => {
    await reset();
    post = (
      await api.post("/posts", w.tokens.ann, {
        caption: "Bài bị báo cáo",
        privacy: "everyone",
      })
    ).body.post.id;
    comment = (
      await api.post(`/posts/${post}/comments`, w.tokens.ben, {
        body: "bình luận xấu",
      })
    ).body.id;
  });

  const report = (
    who: Token,
    targetKind: string,
    targetId: number,
    reason?: string,
  ) => api.post("/reports", w.tokens[who], { targetKind, targetId, reason });
  const openCount = async () =>
    count(
      w.ds,
      `SELECT count(*)::int FROM social_reports WHERE status = 'open'`,
    );

  it("files a report on a visible post, comment and user; duplicates collapse", async () => {
    expect((await report("cat", "post", post, "  spam  ")).status).toBe(204);
    expect((await report("cat", "post", post, "again")).status).toBe(204);
    expect((await report("cat", "comment", comment)).status).toBe(204);
    expect((await report("cat", "user", w.ids.ben, "x")).status).toBe(204);

    expect(await openCount()).toBe(3);
    expect(
      (
        await w.ds.query(
          `SELECT reason FROM social_reports WHERE target_kind = 'post'`,
        )
      )[0].reason,
    ).toBe("spam");
    // A different reporter files their own.
    expect((await report("dan", "post", post)).status).toBe(204);
    expect(await openCount()).toBe(4);
  });

  it("parallel duplicate reports keep exactly one open report and none fails", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => report("dan", "comment", comment, "dup")),
    );

    expect(results.map((r) => r.status)).toEqual(Array(6).fill(204));
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM social_reports
         WHERE reporter_key = 'user:${w.ids.dan}' AND target_kind = 'comment' AND status = 'open'`,
      ),
    ).toBe(1);
  });

  it("refuses what the reporter cannot see, their own content and themselves", async () => {
    const hidden = (
      await api.post("/posts", w.tokens.ann, {
        caption: "friends only",
        privacy: "friends",
      })
    ).body.post.id;

    for (const [who, kind, id] of [
      ["cat", "post", hidden],
      ["ann", "post", post],
      ["ben", "comment", comment],
      ["ann", "user", w.ids.ann],
      ["cat", "user", 999999],
      ["cat", "post", 999999],
    ] as const) {
      const response = await report(who, kind, id);

      expect(response.status, `${who} ${kind} ${id}`).toBe(404);
      expect(response.body.message).toBe(SOCIAL_FRIEND_MESSAGES.NOT_FOUND);
    }
    await w.ds.query(
      `INSERT INTO social_blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, now())`,
      [w.ids.cat, w.ids.ben],
    );
    expect((await report("cat", "user", w.ids.ben)).status).toBe(404);
    await w.ds.query(`DELETE FROM social_blocks`);
  });

  it("validates the reason length and the kind", async () => {
    const long = await report("dan", "user", w.ids.cat, "x".repeat(501));

    expect(long.status).toBe(400);
    expect(long.body.message).toContain(SOCIAL_FRIEND_MESSAGES.REASON_TOO_LONG);
    expect(
      (await report("dan", "user", w.ids.cat, "x".repeat(500))).status,
    ).toBe(204);
    expect((await report("dan", "thing", 1)).status).toBe(400);
  });

  it("lets an admin report; a PT only inside their workspace", async () => {
    expect((await report("ptA", "post", post)).status).toBe(204);
    expect((await report("ptA", "user", w.ids.cat)).status).toBe(204);
    expect((await report("ptA", "user", w.ids.dan)).status).toBe(404);
    expect((await report("superAdmin", "user", w.ids.dan)).status).toBe(204);
  });

  it("lists open reports for a super admin with previews, oldest first", async () => {
    const list = await api.get("/reports", w.tokens.superAdmin);

    expect(list.status).toBe(200);
    expect(list.body.openCount).toBe(list.body.items.length);
    const first = list.body.items.find(
      (item: { targetKind: string; reporterName: string }) =>
        item.targetKind === "post" && item.reporterName === "Cat",
    );

    expect(first).toMatchObject({
      targetId: post,
      reason: "spam",
      preview: "Bài bị báo cáo",
      targetName: "Ann",
      postId: post,
    });
    const asComment = list.body.items.find(
      (item: { targetKind: string }) => item.targetKind === "comment",
    );

    expect(asComment).toMatchObject({
      preview: "bình luận xấu",
      targetName: "Ben",
      postId: post,
    });
    const asUser = list.body.items.find(
      (item: { targetKind: string; targetId: number }) =>
        item.targetKind === "user" && item.targetId === w.ids.ben,
    );

    expect(asUser).toMatchObject({
      preview: null,
      targetName: "Ben",
      postId: null,
    });
    const times = list.body.items.map(
      (item: { createdAt: string }) => item.createdAt,
    );

    expect(times).toEqual([...times].sort());
    // Only a super admin reads or resolves them.
    for (const who of ["ptA", "ann"] as const) {
      expect((await api.get("/reports", w.tokens[who])).status).toBe(403);
      expect(
        (
          await api.post("/reports/1/resolve", w.tokens[who], {
            resolution: "kept",
          })
        ).status,
      ).toBe(403);
    }
  });

  it("keeping closes every open report on the target and leaves the post", async () => {
    const open = (
      await w.ds.query(
        `SELECT id FROM social_reports WHERE target_kind = 'post' AND target_id = $1 AND status = 'open' ORDER BY id`,
        [post],
      )
    ).map((row: { id: number }) => row.id);

    expect(open.length).toBeGreaterThanOrEqual(3);
    expect(
      (
        await api.post(`/reports/${open[0]}/resolve`, w.tokens.superAdmin, {
          resolution: "kept",
        })
      ).status,
    ).toBe(204);
    const rows = await w.ds.query(
      `SELECT status, resolution, resolved_by FROM social_reports WHERE target_kind = 'post' AND target_id = $1`,
      [post],
    );

    expect(
      rows.every(
        (r: { status: string; resolution: string; resolved_by: number }) =>
          r.status === "resolved" &&
          r.resolution === "kept" &&
          r.resolved_by === w.ids.superAdmin,
      ),
    ).toBe(true);
    expect((await api.get(`/posts/${post}`, w.tokens.ann)).status).toBe(200);
    // Already closed: not found.
    const again = await api.post(
      `/reports/${open[0]}/resolve`,
      w.tokens.superAdmin,
      { resolution: "kept" },
    );

    expect(again.status).toBe(404);
    expect(again.body).toMatchObject({
      code: "REPORT_NOT_FOUND",
      message: SOCIAL_FRIEND_MESSAGES.REPORT_NOT_FOUND,
    });
  });

  it("deleting removes the comment (emptied) and closes its reports; a user report just closes", async () => {
    const commentReport = (
      await w.ds.query(
        `SELECT id FROM social_reports WHERE target_kind = 'comment' AND status = 'open'`,
      )
    )[0].id;

    expect(
      (
        await api.post(
          `/reports/${commentReport}/resolve`,
          w.tokens.superAdmin,
          { resolution: "deleted" },
        )
      ).status,
    ).toBe(204);
    expect(
      (await api.get(`/posts/${post}/comments`, w.tokens.ann)).body.items,
    ).toEqual([]);
    const userReport = (
      await w.ds.query(
        `SELECT id FROM social_reports WHERE target_kind = 'user' AND target_id = $1 AND status = 'open'`,
        [w.ids.ben],
      )
    )[0].id;

    expect(
      (
        await api.post(`/reports/${userReport}/resolve`, w.tokens.superAdmin, {
          resolution: "deleted",
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await w.ds.query(
          `SELECT resolution FROM social_reports WHERE id = $1`,
          [userReport],
        )
      )[0].resolution,
    ).toBe("kept");
    expect(
      (await api.get(`/profiles/user:${w.ids.ben}`, w.tokens.ann)).status,
    ).toBe(200);
  });

  it("deleting a reported post removes it and closes every report on it, even if it is already gone", async () => {
    const target = (
      await api.post("/posts", w.tokens.ann, {
        caption: "xóa đi",
        privacy: "everyone",
      })
    ).body.post.id;

    await report("cat", "post", target);
    await report("dan", "post", target);
    const ids = (
      await w.ds.query(
        `SELECT id FROM social_reports WHERE target_id = $1 AND target_kind = 'post'`,
        [target],
      )
    ).map((row: { id: number }) => row.id);

    expect(
      (
        await api.post(`/reports/${ids[0]}/resolve`, w.tokens.superAdmin, {
          resolution: "deleted",
        })
      ).status,
    ).toBe(204);
    expect((await api.get(`/posts/${target}`, w.tokens.ann)).status).toBe(404);
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM social_reports WHERE target_id = $1 AND target_kind = 'post' AND status = 'open'`,
        [target],
      ),
    ).toBe(0);

    // A target deleted by its author before resolution counts as done.
    const gone = (
      await api.post("/posts", w.tokens.ann, {
        caption: "tự xóa",
        privacy: "everyone",
      })
    ).body.post.id;

    await report("cat", "post", gone);
    await api.delete(`/posts/${gone}`, w.tokens.ann);
    const goneReport = (
      await w.ds.query(
        `SELECT id FROM social_reports WHERE target_id = $1 AND target_kind = 'post'`,
        [gone],
      )
    )[0].id;

    expect(
      (
        await api.post(`/reports/${goneReport}/resolve`, w.tokens.superAdmin, {
          resolution: "deleted",
        })
      ).status,
    ).toBe(204);
    const listed = (await api.get("/reports", w.tokens.superAdmin)).body.items;

    expect(
      listed.some(
        (item: { targetId: number; targetKind: string }) =>
          item.targetId === gone && item.targetKind === "post",
      ),
    ).toBe(false);
  });

  it("shows a placeholder preview for content that is gone", async () => {
    const target = (
      await api.post("/posts", w.tokens.ann, {
        caption: "tạm",
        privacy: "everyone",
      })
    ).body.post.id;

    await report("cat", "post", target);
    await api.delete(`/posts/${target}`, w.tokens.ann);
    const item = (
      await api.get("/reports", w.tokens.superAdmin)
    ).body.items.find(
      (r: { targetKind: string; targetId: number }) =>
        r.targetKind === "post" && r.targetId === target,
    );

    expect(item).toMatchObject({
      preview: null,
      targetName: null,
      postId: null,
    });
  });
});
