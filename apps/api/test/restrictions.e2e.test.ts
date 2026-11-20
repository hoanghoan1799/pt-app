import { RESTRICTION_ERROR_CODES, RESTRICTION_MESSAGES } from "@pt/contracts";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DmConversation } from "../src/database/entities/dm-conversation.entity.js";
import { DmMessage } from "../src/database/entities/dm-message.entity.js";
import {
  bearer,
  DAY,
  loginUser,
  MINUTE,
  seedUser,
  tokenOf,
} from "./support/auth.js";
import { callWith, enableChat, newKey, pngBytes } from "./support/chat.js";
import {
  connectClient,
  listenOnRandomPort,
  pause,
  type Rejection,
} from "./support/realtime.js";
import {
  acceptTerms,
  befriend,
  createSocialWorld,
  destroySocialWorld,
  PNG_1X1,
  social,
  type SocialWorld,
} from "./support/social.js";

// Port of the company test matrix (docs/specs/admin-block-user.md there):
// restriction-service, restriction-guards, restriction-session and
// restriction-hidden, against the real API and PostgreSQL.

let w: SocialWorld;
let api: ReturnType<typeof social>;

beforeAll(async () => {
  w = await createSocialWorld();
  api = social(w.app);
  for (const id of [w.ids.ann, w.ids.ben, w.ids.cat]) {
    await enableChat(w.ds, id);
  }
});

afterAll(async () => {
  await destroySocialWorld(w);
});

const http = () => request(w.app.getHttpServer());

const restrictionPath = (userId: number) =>
  `/v1/trainees/${userId}/restriction`;

const block = (
  userId: number,
  body: object,
  token: string = w.tokens.superAdmin,
) => http().put(restrictionPath(userId)).set(bearer(token)).send(body);

const lift = (userId: number, token: string = w.tokens.superAdmin) =>
  http().delete(restrictionPath(userId)).set(bearer(token));

const readRestriction = (userId: number, token: string = w.tokens.superAdmin) =>
  http().get(restrictionPath(userId)).set(bearer(token));

const rows = async (userId: number) =>
  (await w.ds.query(
    `SELECT level, until, reason, created_by_admin_id, created_at, lifted_at, lifted_by_admin_id
       FROM user_restrictions WHERE user_id = $1 ORDER BY id`,
    [userId],
  )) as {
    level: string;
    until: Date | null;
    reason: string;
    created_by_admin_id: number | null;
    created_at: Date;
    lifted_at: Date | null;
    lifted_by_admin_id: number | null;
  }[];

const RESTRICT = { level: "restricted", duration: "7d", reason: "spam" };
const SUSPEND = { level: "suspended", duration: "24h", reason: "nội quy" };

const me = (token: string) => http().get("/v1/auth/me").set(bearer(token));

const chatSend = (token: string, body: object = { body: "chào PT" }) =>
  callWith(w.app, "post", "/v1/chat/conversations/me/messages", token, {
    body,
    headers: { "Idempotency-Key": newKey() },
  });

beforeEach(async () => {
  await w.ds.query(`DELETE FROM user_restrictions`);
});

describe("block, re-block and lift (super admin only)", () => {
  it("refuses a PT on every route and writes nothing", async () => {
    for (const token of [w.tokens.ptA, w.tokens.ptB]) {
      expect((await block(w.ids.ann, RESTRICT, token)).status).toBe(403);
      expect((await lift(w.ids.ann, token)).status).toBe(403);
      expect((await readRestriction(w.ids.ann, token)).status).toBe(403);
    }
    expect((await block(w.ids.ann, RESTRICT, w.tokens.ann)).status).toBe(403);
    expect(await rows(w.ids.ann)).toEqual([]);
  });

  it("stores the level, the end, the trimmed reason and the admin", async () => {
    const response = await block(w.ids.ann, {
      ...RESTRICT,
      reason: "  spam trong chat  ",
    });

    expect(response.status).toBe(200);
    expect(response.body.restriction).toEqual({
      id: expect.any(Number),
      level: "restricted",
      until: new Date(w.clock.now().getTime() + 7 * DAY).toISOString(),
      reason: "spam trong chat",
      createdAt: w.clock.now().toISOString(),
    });
    expect(await rows(w.ids.ann)).toEqual([
      {
        level: "restricted",
        until: new Date(w.clock.now().getTime() + 7 * DAY),
        reason: "spam trong chat",
        created_by_admin_id: w.ids.superAdmin,
        created_at: w.clock.now(),
        lifted_at: null,
        lifted_by_admin_id: null,
      },
    ]);
  });

  it("stores a permanent block with no end", async () => {
    await block(w.ids.ann, { ...SUSPEND, duration: "permanent" });

    expect((await rows(w.ids.ann))[0]).toMatchObject({
      level: "suspended",
      until: null,
    });
  });

  it("refuses bad values and a missing trainee, writing nothing", async () => {
    for (const body of [
      { ...RESTRICT, reason: "   " },
      { ...RESTRICT, reason: "a".repeat(301) },
      { ...RESTRICT, level: "banned" },
      { ...RESTRICT, duration: "1y" },
      { level: "restricted", duration: "7d" },
    ]) {
      expect((await block(w.ids.ann, body)).status, JSON.stringify(body)).toBe(
        400,
      );
    }
    const missing = await block(987_654, RESTRICT);

    expect(missing.status).toBe(404);
    expect((await block(0, RESTRICT)).status).toBe(404);
    expect((await w.ds.query(`SELECT 1 FROM user_restrictions`)).length).toBe(
      0,
    );
  });

  it("re-blocking lifts the previous block (one transaction) and keeps the history", async () => {
    await block(w.ids.ann, RESTRICT);
    w.clock.advance(MINUTE);
    const changed = await block(w.ids.ann, SUSPEND);

    expect(changed.status).toBe(200);
    const [first, second] = await rows(w.ids.ann);

    expect(first).toMatchObject({
      level: "restricted",
      lifted_at: w.clock.now(),
      lifted_by_admin_id: w.ids.superAdmin,
    });
    expect(second).toMatchObject({ level: "suspended", lifted_at: null });

    const read = await readRestriction(w.ids.ann);

    expect(read.status).toBe(200);
    expect(read.body.restriction.level).toBe("suspended");
    expect(read.body.history).toHaveLength(2);
    expect(read.body.history[0]).toMatchObject({
      level: "suspended",
      active: true,
      createdBy: expect.any(String),
      liftedAt: null,
    });
    expect(read.body.history[1]).toMatchObject({
      level: "restricted",
      active: false,
      liftedAt: w.clock.now().toISOString(),
      liftedBy: expect.any(String),
    });
  });

  it("an expired block that was never lifted ends at its until, without a lifter", async () => {
    await block(w.ids.ann, { ...RESTRICT, duration: "24h" });
    const until = new Date(w.clock.now().getTime() + DAY);

    w.clock.advance(2 * DAY);
    expect((await readRestriction(w.ids.ann)).body.restriction).toBeNull();
    await block(w.ids.ann, RESTRICT);

    expect((await rows(w.ids.ann))[0]).toMatchObject({
      lifted_at: until,
      lifted_by_admin_id: null,
    });
  });

  it("two blocks at once queue on the trainee row instead of failing", async () => {
    const results = await Promise.all([
      block(w.ids.ann, RESTRICT),
      block(w.ids.ann, SUSPEND),
      block(w.ids.ann, RESTRICT),
    ]);

    expect(results.map((result) => result.status)).toEqual([200, 200, 200]);
    const all = await rows(w.ids.ann);

    expect(all).toHaveLength(3);
    expect(all.filter((row) => row.lifted_at === null)).toHaveLength(1);
  });

  it("lifts early, recording when and by whom; nothing to lift is 409", async () => {
    await block(w.ids.ann, RESTRICT);
    w.clock.advance(MINUTE);

    expect((await lift(w.ids.ann)).status).toBe(204);
    expect((await rows(w.ids.ann))[0]).toMatchObject({
      lifted_at: w.clock.now(),
      lifted_by_admin_id: w.ids.superAdmin,
    });

    const again = await lift(w.ids.ann);

    expect(again.status).toBe(409);
    expect(again.body.code).toBe(RESTRICTION_ERROR_CODES.NOT_RESTRICTED);
    expect(again.body.message).toBe(RESTRICTION_MESSAGES.NOT_RESTRICTED);
    expect((await lift(987_654)).status).toBe(404);
  });

  it("an expired block cannot be lifted and stops counting at read time", async () => {
    await block(w.ids.ann, { ...RESTRICT, duration: "24h" });
    w.clock.advance(DAY);

    expect((await readRestriction(w.ids.ann)).body.restriction).toBeNull();
    expect((await lift(w.ids.ann)).status).toBe(409);
  });

  it("shows the badge level to every admin on the dashboard", async () => {
    await block(w.ids.ann, RESTRICT);
    await block(w.ids.ben, SUSPEND);

    for (const token of [w.tokens.superAdmin, w.tokens.ptA]) {
      const response = await http()
        .get("/v1/dashboard/summary")
        .set(bearer(token));
      const levels = new Map(
        (
          response.body.members as {
            id: number;
            restrictionLevel: string | null;
          }[]
        ).map((member) => [member.id, member.restrictionLevel]),
      );

      expect(levels.get(w.ids.ann)).toBe("restricted");
      expect(levels.get(w.ids.ben)).toBe("suspended");
      expect(levels.get(w.ids.cat)).toBeNull();
    }
  });
});

describe("restricted: guarded writes are refused, reads and take-backs stay open", () => {
  const expectRestricted = (
    response: { status: number; body: { code?: string; message?: string } },
    label: string,
  ) => {
    expect(response.status, label).toBe(403);
    expect(response.body.code, label).toBe(RESTRICTION_ERROR_CODES.RESTRICTED);
    expect(response.body.message, label).toBe(RESTRICTION_MESSAGES.RESTRICTED);
  };

  it("chat: send (text, sticker, photo), react, unreact, edit and photo upload refused; unsend and read allowed", async () => {
    const sent = await chatSend(w.tokens.ann, { body: "trước khi bị chặn" });

    expect(sent.status).toBe(201);
    const messageId = sent.body.message.id as number;

    await block(w.ids.ann, RESTRICT);

    expectRestricted(await chatSend(w.tokens.ann), "text");
    expectRestricted(
      await chatSend(w.tokens.ann, {
        sticker: { kind: "emoji", value: "👍" },
      }),
      "sticker",
    );
    expectRestricted(
      await chatSend(w.tokens.ann, { photoIds: [1] }),
      "photo message",
    );
    expectRestricted(
      await http()
        .post("/v1/chat/photos")
        .set(bearer(w.tokens.ann))
        .set("Content-Type", "image/png")
        .send(pngBytes()),
      "photo upload",
    );
    expectRestricted(
      await callWith(
        w.app,
        "put",
        `/v1/chat/messages/${messageId}/reaction`,
        w.tokens.ann,
        { body: { emoji: "❤️" } },
      ),
      "react",
    );
    expectRestricted(
      await callWith(
        w.app,
        "delete",
        `/v1/chat/messages/${messageId}/reaction`,
        w.tokens.ann,
      ),
      "unreact",
    );
    expectRestricted(
      await callWith(
        w.app,
        "patch",
        `/v1/chat/messages/${messageId}`,
        w.tokens.ann,
        { body: { body: "sửa" } },
      ),
      "edit",
    );

    const thread = await callWith(
      w.app,
      "get",
      "/v1/chat/conversations/me/messages",
      w.tokens.ann,
    );

    expect(thread.status).toBe(200);

    const unsent = await callWith(
      w.app,
      "delete",
      `/v1/chat/messages/${messageId}`,
      w.tokens.ann,
    );

    expect(unsent.status).toBe(200);
  });

  it("social: post, edit post, bio, comment, edit comment, reactions, photo, friend request and accept refused; deleting own content, declining and blocking allowed", async () => {
    await befriend(w.ds, w.ids.ann, w.ids.cat);
    const post = await api.post("/posts", w.tokens.ann, {
      caption: "của tôi",
      privacy: "everyone",
    });
    const postId = post.body.post.id as number;
    const comment = await api.post(`/posts/${postId}/comments`, w.tokens.ann, {
      body: "bình luận",
    });
    const commentId = comment.body.id as number;

    // Ben asked Ann; Dan is a stranger she might ask.
    await api.post("/friends/requests", w.tokens.ben, { userId: w.ids.ann });
    await block(w.ids.ann, RESTRICT);

    expectRestricted(
      await api.post("/posts", w.tokens.ann, {
        caption: "mới",
        privacy: "everyone",
      }),
      "post",
    );
    expectRestricted(
      await api.patch(`/posts/${postId}`, w.tokens.ann, {
        caption: "sửa",
        privacy: "everyone",
      }),
      "edit post",
    );
    expectRestricted(
      await http()
        .put("/v1/me/bio")
        .set(bearer(w.tokens.ann))
        .send({ bio: "xin chào" }),
      "bio",
    );
    expectRestricted(
      await api.post(`/posts/${postId}/comments`, w.tokens.ann, {
        body: "nữa",
      }),
      "comment",
    );
    expectRestricted(
      await api.patch(`/comments/${commentId}`, w.tokens.ann, { body: "sửa" }),
      "edit comment",
    );
    expectRestricted(
      await api.put(`/posts/${postId}/reaction`, w.tokens.ann, {
        emoji: "❤️",
      }),
      "react",
    );
    expectRestricted(
      await api.delete(`/posts/${postId}/reaction`, w.tokens.ann),
      "unreact",
    );
    expectRestricted(await api.upload(w.tokens.ann, PNG_1X1), "photo upload");
    expectRestricted(
      await api.post("/friends/requests", w.tokens.ann, { userId: w.ids.dan }),
      "friend request",
    );
    expectRestricted(
      await api.post(`/friends/requests/${w.ids.ben}/accept`, w.tokens.ann),
      "accept",
    );
    expectRestricted(
      await callWith(
        w.app,
        "post",
        "/v1/dm/conversations/1/messages",
        w.tokens.ann,
        {
          body: { body: "hi", clientId: newKey() },
        },
      ),
      "dm",
    );

    // Reading and taking content back (D11).
    expect((await api.get("/feed", w.tokens.ann)).status).toBe(200);
    expect(
      (await api.delete(`/comments/${commentId}`, w.tokens.ann)).status,
    ).toBe(204);
    expect((await api.delete(`/posts/${postId}`, w.tokens.ann)).status).toBe(
      204,
    );
    expect(
      (await api.post(`/friends/requests/${w.ids.ben}/decline`, w.tokens.ann))
        .status,
    ).toBe(204);
    expect((await api.put(`/blocks/${w.ids.cat}`, w.tokens.ann)).status).toBe(
      204,
    );
    expect(
      (await api.delete(`/blocks/${w.ids.cat}`, w.tokens.ann)).status,
    ).toBe(204);

    // Admins are never restricted, and another trainee is untouched.
    expect(
      (
        await api.post("/posts", w.tokens.superAdmin, {
          caption: "admin",
          privacy: "everyone",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await api.post("/posts", w.tokens.cat, {
          caption: "cat",
          privacy: "everyone",
        })
      ).status,
    ).toBe(201);
    await w.ds.query(`DELETE FROM social_friendships`);
  });

  it("a lifted or expired block lets the trainee write again", async () => {
    await block(w.ids.ann, RESTRICT);
    expectRestricted(await chatSend(w.tokens.ann), "while blocked");

    await lift(w.ids.ann);
    expect((await chatSend(w.tokens.ann)).status).toBe(201);

    await block(w.ids.ann, { ...RESTRICT, duration: "24h" });
    expectRestricted(await chatSend(w.tokens.ann), "blocked again");
    w.clock.advance(DAY + MINUTE);
    expect((await chatSend(w.tokens.ann)).status).toBe(201);
  });
});

describe("session and login", () => {
  const seedTrainee = async () => {
    const user = await seedUser(w.ds, { ptAdminId: w.ids.ptA });

    await acceptTerms(w.ds, user.id);
    return user;
  };

  it("a restricted trainee keeps the session and sees the block in /auth/me", async () => {
    const user = await seedTrainee();
    const token = await tokenOf(w.app, { kind: "user", ...user });

    expect((await me(token)).body.actor.restriction).toBeNull();
    await block(user.id, RESTRICT);

    const response = await me(token);

    expect(response.status).toBe(200);
    expect(response.body.actor.restriction).toEqual({
      id: expect.any(Number),
      level: "restricted",
      until: new Date(w.clock.now().getTime() + 7 * DAY).toISOString(),
      reason: "spam",
      createdAt: w.clock.now().toISOString(),
    });
    // A restricted trainee can still sign in.
    expect((await loginUser(w.app, user)).status).toBe(200);
  });

  it("a suspended trainee's open session is rejected, and works again once lifted or run out", async () => {
    const user = await seedTrainee();
    const token = await tokenOf(w.app, { kind: "user", ...user });

    await block(user.id, SUSPEND);
    const rejected = await me(token);

    expect(rejected.status).toBe(401);
    expect(rejected.body.code).toBe("SESSION_INVALID");
    expect(
      (await http().get("/v1/social/feed").set(bearer(token))).status,
    ).toBe(401);

    await lift(user.id);
    expect((await me(token)).status).toBe(200);

    await block(user.id, SUSPEND);
    expect((await me(token)).status).toBe(401);
    w.clock.advance(DAY + MINUTE);
    expect((await me(token)).status).toBe(200);
  });

  it("refuses the login of a suspended trainee after the right password, with the end and the reason", async () => {
    const user = await seedTrainee();

    await block(user.id, SUSPEND);
    const until = new Date(w.clock.now().getTime() + DAY);
    const refused = await loginUser(w.app, user);

    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe(RESTRICTION_ERROR_CODES.ACCOUNT_SUSPENDED);
    expect(refused.body.message).toMatch(
      /^Tài khoản của bạn đã bị khoá đến \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\. Lý do: nội quy$/,
    );
    expect(refused.body.details).toEqual({
      reason: "nội quy",
      permanent: false,
      until: until.toISOString(),
    });
    expect(refused.body.token).toBeUndefined();
    // No session was started.
    expect(
      (await w.ds.query(`SELECT 1 FROM sessions WHERE user_id = $1`, [user.id]))
        .length,
    ).toBe(0);
  });

  it("says permanent for a permanent suspension", async () => {
    const user = await seedTrainee();

    await block(user.id, { ...SUSPEND, duration: "permanent" });
    const refused = await loginUser(w.app, user);

    expect(refused.status).toBe(403);
    expect(refused.body.message).toBe(
      "Tài khoản của bạn đã bị khoá vĩnh viễn. Lý do: nội quy",
    );
    expect(refused.body.details).toEqual({
      reason: "nội quy",
      permanent: true,
    });
  });

  it("a wrong password never reveals the suspension", async () => {
    const user = await seedTrainee();

    await block(user.id, SUSPEND);
    const wrong = await loginUser(w.app, {
      email: user.email,
      password: "not-the-password",
    });

    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("INVALID_CREDENTIALS");
    expect(JSON.stringify(wrong.body)).not.toContain("nội quy");
  });
});

describe("suspended trainees are hidden from other trainees (D4)", () => {
  const ids = async (path: string, token: string) =>
    (await api.get(path, token)).body;

  beforeEach(async () => {
    await w.ds.query(`DELETE FROM social_friendships`);
    await w.ds.query(`DELETE FROM social_blocks`);
  });

  it("drops out of friends, feed, search, requests, profiles, comments and DMs; restricted is not hidden; nothing is deleted", async () => {
    await befriend(w.ds, w.ids.ann, w.ids.ben);
    // Cat asked Ann.
    await api.post("/friends/requests", w.tokens.cat, { userId: w.ids.ann });
    const benPost = await api.post("/posts", w.tokens.ben, {
      caption: "ben",
      privacy: "friends",
    });
    const annPost = await api.post("/posts", w.tokens.ann, {
      caption: "ann",
      privacy: "everyone",
    });

    await api.post(`/posts/${annPost.body.post.id}/comments`, w.tokens.ben, {
      body: "từ ben",
    });
    const conversation = await w.ds.getRepository(DmConversation).save({
      userLow: Math.min(w.ids.ann, w.ids.ben),
      userHigh: Math.max(w.ids.ann, w.ids.ben),
      createdAt: w.clock.now(),
    });
    const dm = await w.ds.getRepository(DmMessage).save({
      conversationId: conversation.id,
      senderId: w.ids.ben,
      body: "chào",
      clientId: newKey(),
      createdAt: w.clock.now(),
    });

    await w.ds
      .getRepository(DmConversation)
      .update(
        { id: conversation.id },
        { lastMessageId: dm.id, lastMessageAt: dm.createdAt },
      );
    const benEmail = (
      await w.ds.query(`SELECT email FROM users WHERE id = $1`, [w.ids.ben])
    )[0].email as string;
    const catEmail = (
      await w.ds.query(`SELECT email FROM users WHERE id = $1`, [w.ids.cat])
    )[0].email as string;

    const visible = async () => ({
      friends: (await ids("/friends", w.tokens.ann)).items.map(
        (person: { id: number }) => person.id,
      ),
      feed: (await ids("/feed?limit=50", w.tokens.ann)).items.map(
        (item: { id: number }) => item.id,
      ),
      search: (
        await ids(`/people?email=${encodeURIComponent(benEmail)}`, w.tokens.ann)
      ).result,
      requests: (await ids("/friends/requests", w.tokens.ann)).received.map(
        (person: { id: number }) => person.id,
      ),
      profile: (await api.get(`/profiles/user:${w.ids.ben}`, w.tokens.ann))
        .status,
      comments: (
        await ids(`/posts/${annPost.body.post.id}/comments`, w.tokens.ann)
      ).items.length,
      dms: (
        await callWith(w.app, "get", "/v1/dm/conversations", w.tokens.ann)
      ).body.conversations.map((item: { otherId: number }) => item.otherId),
      dmThread: (
        await callWith(
          w.app,
          "get",
          `/v1/dm/conversations/${conversation.id}/messages`,
          w.tokens.ann,
        )
      ).status,
    });

    const before = await visible();

    expect(before.friends).toEqual([w.ids.ben]);
    expect(before.feed).toContain(benPost.body.post.id);
    expect(before.search).toMatchObject({ id: w.ids.ben });
    expect(before.requests).toEqual([w.ids.cat]);
    expect(before.profile).toBe(200);
    expect(before.comments).toBe(1);
    expect(before.dms).toEqual([w.ids.ben]);
    expect(before.dmThread).toBe(200);

    // A restriction does not hide anyone.
    await block(w.ids.ben, RESTRICT);
    await block(w.ids.cat, RESTRICT);
    expect(await visible()).toEqual(before);

    await block(w.ids.ben, SUSPEND);
    await block(w.ids.cat, SUSPEND);
    const during = await visible();

    expect(during.friends).toEqual([]);
    expect(during.feed).not.toContain(benPost.body.post.id);
    expect(during.feed).toContain(annPost.body.post.id);
    expect(during.search).toBeNull();
    expect(during.requests).toEqual([]);
    expect(during.profile).toBe(404);
    expect(during.comments).toBe(0);
    expect(during.dms).toEqual([]);
    expect(during.dmThread).toBe(404);
    expect(
      (await ids(`/people?email=${encodeURIComponent(catEmail)}`, w.tokens.ann))
        .result,
    ).toBeNull();

    // Blocked either way: Ann cannot ask a suspended trainee.
    expect(
      (await api.post("/friends/requests", w.tokens.ann, { userId: w.ids.ben }))
        .status,
    ).toBe(404);

    // Nothing was deleted: lifting brings it all back.
    await lift(w.ids.ben);
    await lift(w.ids.cat);
    expect(await visible()).toEqual(before);
  });
});

describe("realtime", () => {
  it("drops a suspended trainee's open sockets and refuses the reconnect; a restriction keeps them", async () => {
    const url = await listenOnRandomPort(w.app);
    const user = await seedUser(w.ds, { ptAdminId: w.ids.ptA });
    const token = await tokenOf(w.app, { kind: "user", ...user });
    const client = await connectClient(url, { token });

    await block(user.id, RESTRICT);
    await pause(150);
    expect(client.socket.connected).toBe(true);

    const closed = client.disconnected();

    await block(user.id, SUSPEND);
    expect(await client.waitFor("auth:revoked")).toEqual({
      reason: "signed_out",
    });
    await closed;

    let refused: Rejection | null = null;

    try {
      (await connectClient(url, { token })).close();
    } catch (error) {
      refused = error as Rejection;
    }
    expect(refused).not.toBeNull();
    client.close();
  });
});

describe("member delete", () => {
  it("removes the trainee's restrictions, history included, and only theirs", async () => {
    const user = await seedUser(w.ds, { ptAdminId: w.ids.ptA });

    await block(user.id, RESTRICT);
    await block(user.id, SUSPEND);
    await block(w.ids.cat, RESTRICT);

    const deleted = await http()
      .delete(`/v1/trainees/${user.id}`)
      .set(bearer(w.tokens.superAdmin));

    expect(deleted.status).toBe(204);
    expect(await rows(user.id)).toEqual([]);
    expect(await rows(w.ids.cat)).toHaveLength(1);
  });
});
