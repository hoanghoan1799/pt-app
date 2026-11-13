import { EventEmitter2 } from "@nestjs/event-emitter";
import { SOCIAL_MESSAGES } from "@pt/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { tokenOf } from "./support/auth.js";
import {
  count,
  createSocialWorld,
  destroySocialWorld,
  hide,
  revealHidden,
  social,
  type SocialWorld,
  unlockAdmin,
} from "./support/social.js";

let w: SocialWorld;
let api: ReturnType<typeof social>;
const created: {
  notificationId: number;
  kind: string;
  recipientKey: string;
  commentBody?: string;
}[] = [];

beforeAll(async () => {
  w = await createSocialWorld();
  api = social(w.app);
  // What push and chat will listen to later.
  w.app
    .get(EventEmitter2)
    .on("social.notification.created", (event) => created.push(event));
});

afterAll(async () => {
  await destroySocialWorld(w);
});

type Token = keyof SocialWorld["tokens"];

const newPost = async (
  who: Token,
  privacy: "everyone" | "friends" | "only_me" = "everyone",
  caption = "post",
) => {
  const response = await api.post("/posts", w.tokens[who], {
    caption,
    privacy,
  });

  expect(response.status).toBe(201);
  return response.body.post.id as number;
};

const notificationsOf = async (who: Token) => {
  const response = await api.get("/notifications?limit=100", w.tokens[who]);

  expect(response.status).toBe(200);
  return response.body as {
    items: {
      id: number;
      kind: string;
      text: string;
      postId: number | null;
      actorKey: string;
      actorName: string;
      isUnread: boolean;
    }[];
    nextCursor: string | null;
    unreadCount: number;
  };
};

const rowsOf = (sql: string, params: unknown[] = []) =>
  w.ds.query(sql, params) as Promise<Record<string, unknown>[]>;

describe("reactions", () => {
  it("sets, changes and removes one reaction per person, with a summary per viewer", async () => {
    const id = await newPost("ann");

    expect(
      (await api.put(`/posts/${id}/reaction`, w.tokens.ben, { emoji: "❤️" }))
        .status,
    ).toBe(204);
    expect(
      (await api.put(`/posts/${id}/reaction`, w.tokens.cat, { emoji: "❤️" }))
        .status,
    ).toBe(204);
    expect(
      (await api.put(`/posts/${id}/reaction`, w.tokens.ptA, { emoji: "💪" }))
        .status,
    ).toBe(204);

    const asBen = (await api.get(`/posts/${id}`, w.tokens.ben)).body;
    const asAnn = (await api.get(`/posts/${id}`, w.tokens.ann)).body;

    expect(asBen.reactions).toEqual({
      counts: [
        { emoji: "❤️", count: 2 },
        { emoji: "💪", count: 1 },
      ],
      total: 3,
      mine: "❤️",
    });
    expect(asAnn.reactions.mine).toBeNull();

    // Changing replaces, never adds.
    await api.put(`/posts/${id}/reaction`, w.tokens.ben, { emoji: "👍" });
    const changed = (await api.get(`/posts/${id}`, w.tokens.ben)).body
      .reactions;

    expect(changed.total).toBe(3);
    expect(changed.mine).toBe("👍");

    const reactors = await api.get(`/posts/${id}/reactions`, w.tokens.ben);

    expect(reactors.status).toBe(200);
    expect(reactors.body.items).toEqual(
      expect.arrayContaining([
        { name: "Ben", emoji: "👍", isMe: true },
        { name: "Cat", emoji: "❤️", isMe: false },
      ]),
    );
    expect(reactors.body.items).toHaveLength(3);

    expect(
      (await api.delete(`/posts/${id}/reaction`, w.tokens.ben)).status,
    ).toBe(204);
    expect(
      (await api.get(`/posts/${id}`, w.tokens.ben)).body.reactions.mine,
    ).toBeNull();
    expect(
      (await api.get(`/posts/${id}`, w.tokens.ben)).body.reactions.total,
    ).toBe(2);
  });

  it("validates the emoji", async () => {
    const id = await newPost("ann");

    for (const emoji of ["🔥", "", null, 5]) {
      const response = await api.put(`/posts/${id}/reaction`, w.tokens.ben, {
        emoji,
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_FAILED");
    }
    expect(
      (await api.put(`/posts/${id}/reaction`, w.tokens.ben, { emoji: "🔥" }))
        .body.message,
    ).toContain(SOCIAL_MESSAGES.REACTION_INVALID);
  });

  it("refuses posts the person cannot see, and deleted or missing ones, storing nothing", async () => {
    const hidden = await newPost("ann", "friends");
    const gone = await newPost("ann", "everyone");

    await api.delete(`/posts/${gone}`, w.tokens.ann);

    for (const [id, who] of [
      [hidden, "cat"],
      [hidden, "ptB"],
      [hidden, "dan"],
      [gone, "ben"],
      [999999, "ben"],
    ] as const) {
      const label = `${id} ${who}`;
      const put = await api.put(`/posts/${id}/reaction`, w.tokens[who], {
        emoji: "👍",
      });

      expect(put.status, label).toBe(404);
      expect(put.body).toMatchObject({
        code: "POST_NOT_FOUND",
        message: SOCIAL_MESSAGES.NOT_FOUND,
      });
      expect(
        (await api.delete(`/posts/${id}/reaction`, w.tokens[who])).status,
        label,
      ).toBe(404);
      expect(
        (await api.get(`/posts/${id}/reactions`, w.tokens[who])).status,
        label,
      ).toBe(404);
      expect(
        (await api.get(`/posts/${id}/comments`, w.tokens[who])).status,
        label,
      ).toBe(404);
      expect(
        (await api.post(`/posts/${id}/comments`, w.tokens[who], { body: "hi" }))
          .status,
        label,
      ).toBe(404);
    }
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM social_reactions WHERE post_id = $1`,
        [hidden],
      ),
    ).toBe(0);
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM social_comments WHERE post_id = $1`,
        [hidden],
      ),
    ).toBe(0);
  });

  it("lets the author's PT and the super admin react to a friends post, not another PT", async () => {
    const id = await newPost("ann", "friends");

    expect(
      (await api.put(`/posts/${id}/reaction`, w.tokens.ptA, { emoji: "💪" }))
        .status,
    ).toBe(204);
    expect(
      (
        await api.put(`/posts/${id}/reaction`, w.tokens.superAdmin, {
          emoji: "👍",
        })
      ).status,
    ).toBe(204);
    expect(
      (await api.put(`/posts/${id}/reaction`, w.tokens.ptB, { emoji: "👍" }))
        .status,
    ).toBe(404);
    const reactors = (await api.get(`/posts/${id}/reactions`, w.tokens.ann))
      .body.items;

    expect(reactors.map((r: { emoji: string }) => r.emoji).sort()).toEqual(
      ["💪", "👍"].sort(),
    );
    expect(reactors.every((r: { isMe: boolean }) => !r.isMe)).toBe(true);
  });
});

describe("reaction and comment notifications", () => {
  it("notifies the author once and refreshes it when the reaction changes", async () => {
    const id = await newPost("cat", "everyone", "for notifications");

    await api.put(`/posts/${id}/reaction`, w.tokens.ben, { emoji: "❤️" });
    const first = (await notificationsOf("cat")).items.filter(
      (n) => n.postId === id,
    );

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      kind: "post_reaction",
      text: "Ben đã bày tỏ cảm xúc về bài viết của bạn",
      actorKey: `user:${w.ids.ben}`,
      actorName: "Ben",
      isUnread: true,
    });
    expect(created.at(-1)).toMatchObject({
      notificationId: first[0].id,
      kind: "post_reaction",
      recipientKey: `user:${w.ids.cat}`,
    });

    await api.post("/notifications/read", w.tokens.cat);
    w.clock.advance(60_000);
    await api.put(`/posts/${id}/reaction`, w.tokens.ben, { emoji: "💪" });
    const second = (await notificationsOf("cat")).items.filter(
      (n) => n.postId === id,
    );

    // The same row, unread again.
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].isUnread).toBe(true);

    await api.delete(`/posts/${id}/reaction`, w.tokens.ben);
    expect(
      (await notificationsOf("cat")).items.filter((n) => n.postId === id),
    ).toEqual([]);
  });

  it("does not notify for a reaction or a comment on my own post", async () => {
    const id = await newPost("cat", "everyone");

    await api.put(`/posts/${id}/reaction`, w.tokens.cat, { emoji: "👍" });
    await api.post(`/posts/${id}/comments`, w.tokens.cat, { body: "my own" });
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM social_notifications WHERE post_id = $1`,
        [id],
      ),
    ).toBe(0);
  });

  it("notifies an admin author with the admin key, and each comment notifies", async () => {
    const id = await newPost("ptA", "everyone", "pt post");
    const before = created.length;

    await api.put(`/posts/${id}/reaction`, w.tokens.ann, { emoji: "👍" });
    const comment = await api.post(`/posts/${id}/comments`, w.tokens.ann, {
      body: "  Cảm ơn   huấn luyện viên!  ",
    });

    await api.post(`/posts/${id}/comments`, w.tokens.ann, { body: "again" });
    expect(comment.status).toBe(201);
    const mine = (await notificationsOf("ptA")).items.filter(
      (n) => n.postId === id,
    );

    expect(mine.map((n) => n.kind).sort()).toEqual([
      "post_comment",
      "post_comment",
      "post_reaction",
    ]);
    expect(mine.find((n) => n.kind === "post_comment")?.text).toBe(
      "Ann đã bình luận về bài viết của bạn",
    );
    // The comment text rides on the event for a push, but is never stored.
    const events = created.slice(before);

    expect(events.map((e) => e.recipientKey)).toEqual(
      Array(3).fill(`admin:${w.ids.ptA}`),
    );
    expect(
      events.find((e) => e.commentBody === "Cảm ơn   huấn luyện viên!"),
    ).toBeDefined();
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM social_comments WHERE body LIKE '%luyện%'`,
      ),
    ).toBe(1);
  });

  it("shows the recipient's own nickname for the actor, and drops a deleted account's notifications", async () => {
    await w.ds.query(
      `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at) VALUES ($1, $2, $3, now())`,
      [`user:${w.ids.cat}`, `user:${w.ids.ben}`, "Bạn Ben"],
    );
    const id = await newPost("cat", "everyone");

    await api.put(`/posts/${id}/reaction`, w.tokens.ben, { emoji: "👍" });
    const named = (await notificationsOf("cat")).items.find(
      (n) => n.postId === id,
    );

    expect(named?.actorName).toBe("Bạn Ben");
    expect(named?.text).toBe("Bạn Ben đã bày tỏ cảm xúc về bài viết của bạn");

    // A key of an account that does not exist is refused by the database, and
    // a deleted account takes its notifications with it (foreign key cascade).
    const [{ id: ghostId }] = await w.ds.query(
      `INSERT INTO users (name, name_key) VALUES ('Ghost', 'ghost-notify') RETURNING id`,
    );
    const ghostKey = `user:${ghostId}`;
    const insertGhost = (key: string) =>
      w.ds.query(
        `INSERT INTO social_notifications (recipient_key, kind, actor_key, post_id, created_at)
         VALUES ($1, 'post_comment', $2, $3, now())`,
        [`user:${w.ids.cat}`, key, id],
      );

    await expect(insertGhost("user:99999")).rejects.toMatchObject({
      driverError: { code: "23503" },
    });
    await insertGhost(ghostKey);
    expect(
      (await notificationsOf("cat")).items.some((n) => n.actorKey === ghostKey),
    ).toBe(true);

    await w.ds.query(`DELETE FROM users WHERE id = $1`, [ghostId]);
    expect(
      (await notificationsOf("cat")).items.some((n) => n.actorKey === ghostKey),
    ).toBe(false);
  });

  it("writes the text in the recipient's language", async () => {
    await w.ds.query(`UPDATE users SET locale = 'en' WHERE id = $1`, [
      w.ids.ben,
    ]);
    const benToken = await tokenOf(w.app, {
      kind: "user",
      email: (
        await rowsOf(`SELECT email FROM users WHERE id = $1`, [w.ids.ben])
      )[0].email as string,
      password: "user-password-1",
    });
    const id = await newPost("ben");

    await api.put(`/posts/${id}/reaction`, w.tokens.ann, { emoji: "👍" });
    const response = await api.get("/notifications", benToken);
    const item = response.body.items.find(
      (n: { postId: number }) => n.postId === id,
    );

    expect(item.text).toBe("Ann reacted to your post");
    await w.ds.query(`UPDATE users SET locale = NULL WHERE id = $1`, [
      w.ids.ben,
    ]);
  });
});

describe("notification list", () => {
  it("lists newest first, counts unread, and marks all read only on request", async () => {
    const id = await newPost("dan");

    await api.put(`/posts/${id}/reaction`, w.tokens.ptB, { emoji: "👍" });
    await api.post(`/posts/${id}/comments`, w.tokens.ptB, { body: "good" });
    const unread = await notificationsOf("dan");

    expect(unread.unreadCount).toBeGreaterThanOrEqual(2);
    expect(unread.items.slice(0, 2).map((n) => n.kind)).toEqual([
      "post_comment",
      "post_reaction",
    ]);
    // Reading the list changes nothing.
    expect((await notificationsOf("dan")).unreadCount).toBe(unread.unreadCount);

    expect((await api.post("/notifications/read", w.tokens.dan)).status).toBe(
      204,
    );
    const read = await notificationsOf("dan");

    expect(read.unreadCount).toBe(0);
    expect(read.items.every((n) => !n.isUnread)).toBe(true);
    // Somebody else's notifications are untouched.
    expect((await notificationsOf("ptB")).items.every((n) => n.isUnread)).toBe(
      true,
    );
    expect((await api.get("/me", w.tokens.dan)).body.unreadNotifications).toBe(
      0,
    );
  });

  it("pages with a stable cursor, including rows with the same timestamp", async () => {
    const at = new Date("2026-11-12T09:00:00.000Z");

    for (let i = 0; i < 7; i += 1) {
      await w.ds.query(
        `INSERT INTO social_notifications (recipient_key, kind, actor_key, created_at)
         VALUES ($1, 'friend_accepted', $2, $3)`,
        [
          `user:${w.ids.pat}`,
          `user:${w.ids.ann}`,
          i < 4 ? at : new Date(at.getTime() - i * 1000),
        ],
      );
    }
    const seen: number[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const url: string = `/notifications?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const page = await api.get(url, w.tokens.pat);

      expect(page.status).toBe(200);
      expect(page.body.items.length).toBeLessThanOrEqual(3);
      seen.push(...page.body.items.map((n: { id: number }) => n.id));
      cursor = page.body.nextCursor;
      pages += 1;

      if (cursor && pages === 1) {
        // A new notification arrives between pages: it is not in the later pages.
        await w.ds.query(
          `INSERT INTO social_notifications (recipient_key, kind, actor_key, created_at)
           VALUES ($1, 'friend_accepted', $2, $3)`,
          [
            `user:${w.ids.pat}`,
            `user:${w.ids.ben}`,
            new Date("2026-11-12T09:30:00.000Z"),
          ],
        );
      }
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    expect(
      (await api.get("/notifications?cursor=zzz", w.tokens.pat)).status,
    ).toBe(400);
  });

  it("drops notifications older than 60 days when the list is read", async () => {
    const old = new Date(w.clock.now().getTime() - 61 * 24 * 60 * 60 * 1000);
    const recent = new Date(w.clock.now().getTime() - 59 * 24 * 60 * 60 * 1000);

    for (const at of [old, recent]) {
      await w.ds.query(
        `INSERT INTO social_notifications (recipient_key, kind, actor_key, created_at)
         VALUES ($1, 'friend_request', $2, $3)`,
        [`user:${w.ids.noTerms}`, `user:${w.ids.ann}`, at],
      );
    }
    await api.post("/me/terms", w.tokens.noTerms);
    const requests = (await notificationsOf("noTerms")).items.filter(
      (n) => n.kind === "friend_request",
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].text).toBe("Ann đã gửi lời mời kết bạn");
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM social_notifications
         WHERE recipient_key = $1 AND kind = 'friend_request'`,
        [`user:${w.ids.noTerms}`],
      ),
    ).toBe(1);
  });
});

describe("admin post notifications", () => {
  const userNotified = async (postId: number) =>
    (
      await rowsOf(
        `SELECT recipient_key FROM social_notifications
         WHERE post_id = $1 AND kind = 'admin_post' ORDER BY recipient_key`,
        [postId],
      )
    ).map((row) => row.recipient_key as string);
  const keys = (...ids: number[]) => ids.map((id) => `user:${id}`).sort();

  it("tells a PT's own trainees, not other trainees or admins", async () => {
    const id = await newPost("ptA", "friends", "Lịch tập tuần mới");

    expect(await userNotified(id)).toEqual(
      keys(w.ids.ann, w.ids.ben, w.ids.cat, w.ids.noTerms),
    );
    const item = (await notificationsOf("ann")).items.find(
      (n) => n.postId === id,
    );

    expect(item).toMatchObject({
      kind: "admin_post",
      text: expect.stringContaining("vừa đăng bài mới"),
      actorKey: `admin:${w.ids.ptA}`,
      isUnread: true,
    });
    expect(
      (await notificationsOf("dan")).items.some((n) => n.postId === id),
    ).toBe(false);
  });

  it("tells every trainee for a super admin, and never an admin", async () => {
    const id = await newPost("superAdmin", "everyone");

    expect(await userNotified(id)).toEqual(
      keys(
        w.ids.ann,
        w.ids.ben,
        w.ids.cat,
        w.ids.dan,
        w.ids.noTerms,
        w.ids.pat,
      ),
    );
    expect(await userNotified(id)).not.toContain(`admin:${w.ids.ptA}`);
  });

  it("tells nobody about an only_me post or a trainee's post", async () => {
    expect(await userNotified(await newPost("ptA", "only_me"))).toEqual([]);
    expect(await userNotified(await newPost("ann", "everyone"))).toEqual([]);
  });

  it("skips trainees the author hid unless they revealed them", async () => {
    await unlockAdmin(w.app, w.tokens.ptP, "4321");
    await hide(w.ds, w.ids.ptP, w.ids.pat);

    expect(await userNotified(await newPost("ptP", "everyone"))).toEqual([]);
    await revealHidden(w.app, w.tokens.ptP, "4321");
    expect(await userNotified(await newPost("ptP", "everyone"))).toEqual(
      keys(w.ids.pat),
    );
  });

  it("removes the notifications when the post is deleted", async () => {
    const id = await newPost("ptB", "everyone");

    expect(await userNotified(id)).toEqual(keys(w.ids.dan));
    await api.delete(`/posts/${id}`, w.tokens.ptB);
    expect(await userNotified(id)).toEqual([]);
  });

  it("never fails the post when notifying breaks", async () => {
    await w.ds.query(
      `ALTER TABLE social_notifications ADD CONSTRAINT boom CHECK (false) NOT VALID`,
    );
    try {
      const response = await api.post("/posts", w.tokens.ptA, {
        caption: "still posts",
        privacy: "everyone",
      });

      expect(response.status).toBe(201);
    } finally {
      await w.ds.query(`ALTER TABLE social_notifications DROP CONSTRAINT boom`);
    }
  });
});

describe("comments", () => {
  it("creates, trims and rejects empty or long bodies", async () => {
    const id = await newPost("ann");
    const ok = await api.post(`/posts/${id}/comments`, w.tokens.ben, {
      body: "  hay quá  ",
    });

    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ id: expect.any(Number) });
    const list = (await api.get(`/posts/${id}/comments`, w.tokens.ben)).body;

    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id: ok.body.id,
      authorKind: "user",
      authorId: w.ids.ben,
      authorName: "Ben",
      authorVerified: false,
      body: "hay quá",
      edited: false,
    });
    const empty = await api.post(`/posts/${id}/comments`, w.tokens.ben, {
      body: "   ",
    });

    expect(empty.status).toBe(400);
    expect(empty.body.message).toContain(SOCIAL_MESSAGES.COMMENT_EMPTY);
    const long = await api.post(`/posts/${id}/comments`, w.tokens.ben, {
      body: "x".repeat(1001),
    });

    expect(long.body.message).toContain(SOCIAL_MESSAGES.COMMENT_TOO_LONG);
    expect(
      (
        await api.post(`/posts/${id}/comments`, w.tokens.ben, {
          body: "x".repeat(1000),
        })
      ).status,
    ).toBe(201);
  });

  it("flags edit and delete rights per viewer", async () => {
    const id = await newPost("ann", "everyone");

    await api.post(`/posts/${id}/comments`, w.tokens.ben, { body: "by ben" });
    const rights = async (who: Token) => {
      const item = (await api.get(`/posts/${id}/comments`, w.tokens[who])).body
        .items[0];

      return [item.canEdit, item.canDelete];
    };

    expect(await rights("ben")).toEqual([true, true]);
    expect(await rights("ann")).toEqual([false, true]);
    expect(await rights("superAdmin")).toEqual([false, true]);
    expect(await rights("cat")).toEqual([false, false]);
    expect(await rights("ptA")).toEqual([false, false]);
  });

  it("lets only the commenter edit, and only while the post is visible", async () => {
    const id = await newPost("ann", "friends");
    const comment = (
      await api.post(`/posts/${id}/comments`, w.tokens.ptA, { body: "before" })
    ).body.id;

    expect(
      (await api.patch(`/comments/${comment}`, w.tokens.ann, { body: "hack" }))
        .status,
    ).toBe(403);
    expect(
      (
        await api.patch(`/comments/${comment}`, w.tokens.superAdmin, {
          body: "hack",
        })
      ).body.code,
    ).toBe("SOCIAL_FORBIDDEN");
    expect(
      (
        await api.patch(`/comments/${comment}`, w.tokens.ptA, {
          body: "  after  ",
        })
      ).status,
    ).toBe(204);
    const edited = (await api.get(`/posts/${id}/comments`, w.tokens.ann)).body
      .items[0];

    expect(edited).toMatchObject({ body: "after", edited: true });
    expect(
      (await api.patch(`/comments/${comment}`, w.tokens.ptA, { body: "" }))
        .status,
    ).toBe(400);

    // The post becomes invisible to the editor: only_me by a trainee ptB cannot see.
    const hidden = await newPost("dan", "only_me");
    await w.ds.query(
      `INSERT INTO social_comments (post_id, author_key, body, created_at) VALUES ($1, $2, 'x', now())`,
      [hidden, `admin:${w.ids.ptA}`],
    );
    const orphan = (
      await rowsOf(`SELECT max(id) AS id FROM social_comments`)
    )[0].id as number;

    expect(
      (await api.patch(`/comments/${orphan}`, w.tokens.ptA, { body: "y" }))
        .status,
    ).toBe(404);
    expect(
      (await api.patch("/comments/999999", w.tokens.ptA, { body: "y" })).status,
    ).toBe(404);
  });

  it("lets the commenter, the post author and a super admin delete; others cannot", async () => {
    const id = await newPost("ann", "everyone");
    const make = async (who: Token) =>
      (
        await api.post(`/posts/${id}/comments`, w.tokens[who], {
          body: `by ${who}`,
        })
      ).body.id as number;
    const mine = await make("ben");
    const other = await make("ben");
    const third = await make("ben");

    expect((await api.delete(`/comments/${mine}`, w.tokens.cat)).status).toBe(
      403,
    );
    expect(
      (await api.delete(`/comments/${mine}`, w.tokens.ptA)).body.code,
    ).toBe("SOCIAL_FORBIDDEN");
    expect((await api.delete(`/comments/${mine}`, w.tokens.ben)).status).toBe(
      204,
    );
    expect((await api.delete(`/comments/${other}`, w.tokens.ann)).status).toBe(
      204,
    );
    expect(
      (await api.delete(`/comments/${third}`, w.tokens.superAdmin)).status,
    ).toBe(204);

    expect(
      (await api.get(`/posts/${id}/comments`, w.tokens.ann)).body.items,
    ).toEqual([]);
    expect(
      (await api.get(`/posts/${id}`, w.tokens.ann)).body.commentCount,
    ).toBe(0);
    // The row stays as an empty tombstone.
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM social_comments WHERE post_id = $1 AND deleted_at IS NOT NULL AND body = ''`,
        [id],
      ),
    ).toBe(3);
    expect((await api.delete(`/comments/${mine}`, w.tokens.ben)).status).toBe(
      404,
    );
  });

  it("pages oldest first with a stable cursor", async () => {
    const id = await newPost("ann", "everyone");
    const ids: number[] = [];

    for (let i = 0; i < 7; i += 1) {
      ids.push(
        (
          await api.post(`/posts/${id}/comments`, w.tokens.ben, {
            body: `c${i}`,
          })
        ).body.id,
      );
    }
    const first = await api.get(`/posts/${id}/comments?limit=3`, w.tokens.ann);

    expect(first.body.items.map((c: { body: string }) => c.body)).toEqual([
      "c0",
      "c1",
      "c2",
    ]);
    // A comment arrives between pages; it is last.
    const late = (
      await api.post(`/posts/${id}/comments`, w.tokens.cat, { body: "late" })
    ).body.id;
    const seen = first.body.items.map((c: { id: number }) => c.id) as number[];
    let cursor: string | null = first.body.nextCursor;

    while (cursor) {
      const page = await api.get(
        `/posts/${id}/comments?limit=3&cursor=${encodeURIComponent(cursor)}`,
        w.tokens.ann,
      );

      seen.push(...page.body.items.map((c: { id: number }) => c.id));
      cursor = page.body.nextCursor;
    }
    expect(seen).toEqual([...ids, late]);
    expect(
      (await api.get(`/posts/${id}/comments?cursor=bad`, w.tokens.ann)).status,
    ).toBe(400);
  });

  it("hides a blocked person's comments both ways and uncounts them; admins see all", async () => {
    const id = await newPost("ann", "everyone");

    await api.post(`/posts/${id}/comments`, w.tokens.cat, { body: "from cat" });
    await api.post(`/posts/${id}/comments`, w.tokens.ben, { body: "from ben" });
    await w.ds.query(
      `INSERT INTO social_blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, now())`,
      [w.ids.ben, w.ids.cat],
    );
    const bodies = async (who: Token) =>
      (await api.get(`/posts/${id}/comments`, w.tokens[who])).body.items.map(
        (c: { body: string }) => c.body,
      );

    expect(await bodies("ben")).toEqual(["from ben"]);
    expect(await bodies("cat")).toEqual(["from cat"]);
    expect(await bodies("ann")).toEqual(["from cat", "from ben"]);
    expect(await bodies("ptA")).toEqual(["from cat", "from ben"]);
    expect(
      (await api.get(`/posts/${id}`, w.tokens.ben)).body.commentCount,
    ).toBe(1);
    expect(
      (await api.get(`/posts/${id}`, w.tokens.ann)).body.commentCount,
    ).toBe(2);
    await w.ds.query(`DELETE FROM social_blocks`);
  });
});
