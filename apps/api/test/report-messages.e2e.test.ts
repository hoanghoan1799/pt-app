import { SOCIAL_FRIEND_MESSAGES } from "@pt/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrations } from "../src/migrations/index.js";
import { PUSH_SENDERS } from "../src/push/push-sender.js";
import { SocialCleanupService } from "../src/social/social-cleanup.service.js";
import { hideTrainee } from "./support/auth.js";
import {
  callWith,
  captureEvents,
  newKey,
  pngBytes,
  upload,
} from "./support/chat.js";
import { createTestDatabase } from "./support/database.js";
import {
  FakeWebSender,
  newEndpoint,
  subscriptionBody,
} from "./support/push.js";
import { pause } from "./support/realtime.js";
import {
  count,
  createSocialWorld,
  destroySocialWorld,
  social,
  type SocialWorld,
} from "./support/social.js";

// Reporting a chat message: who may report, the reason code, the admin queue,
// keep / hide, the hide applied by every chat reader, and the super admin push.

const sender = new FakeWebSender();
let w: SocialWorld;
let api: ReturnType<typeof social>;
let events: ReturnType<typeof captureEvents>;
let annConversation: number;
let benConversation: number;
let patConversation: number;

type Token = keyof SocialWorld["tokens"];

beforeAll(async () => {
  w = await createSocialWorld({
    overrideProviders: [{ token: PUSH_SENDERS, value: [sender] }],
  });
  api = social(w.app);
  events = captureEvents(w.app);
  await w.ds.query(`UPDATE users SET chat_enabled = true WHERE id = ANY($1)`, [
    [w.ids.ann, w.ids.ben, w.ids.pat],
  ]);
  const conversation = async (userId: number) =>
    (
      await w.ds.query(
        `INSERT INTO chat_conversations (user_id) VALUES ($1) RETURNING id`,
        [userId],
      )
    )[0].id as number;

  annConversation = await conversation(w.ids.ann);
  benConversation = await conversation(w.ids.ben);
  patConversation = await conversation(w.ids.pat);
});

afterAll(async () => {
  await pause(300);
  await destroySocialWorld(w);
});

beforeEach(async () => {
  sender.reset();
  events.clear();
  await w.ds.query(`DELETE FROM social_reports`);
  await w.ds.query(`DELETE FROM push_subscriptions`);
  await w.ds.query(`DELETE FROM rate_limits`);
});

let counter = 0;

// A message straight into the table: from the trainee, or from PT A.
const message = async (
  conversationId: number,
  from: "user" | "admin",
  body = "xin chào",
  extra: { stickerRef?: string; deleted?: boolean; hiddenBy?: number } = {},
) => {
  counter += 1;
  const rows = await w.ds.query(
    `INSERT INTO chat_messages
       (conversation_id, sender_role, sender_admin_id, body, sticker_ref, client_id,
        deleted_at, hidden_by_admin_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING id`,
    [
      conversationId,
      from,
      from === "admin" ? w.ids.ptA : null,
      body,
      extra.stickerRef ?? null,
      `report-${counter}`,
      extra.deleted ? new Date() : null,
      extra.hiddenBy ?? null,
    ],
  );

  await w.ds.query(
    `UPDATE chat_conversations SET last_message_id = $2 WHERE id = $1`,
    [conversationId, rows[0].id],
  );
  return rows[0].id as number;
};

const report = (
  who: Token,
  targetKind: string,
  targetId: number,
  extra: { reasonCode?: string; reason?: string } = {},
) =>
  api.post("/reports", w.tokens[who], {
    targetKind,
    targetId,
    ...(extra.reasonCode === undefined ? {} : { reasonCode: extra.reasonCode }),
    ...(extra.reason === undefined ? {} : { reason: extra.reason }),
  });

const reportMessage = (who: Token, messageId: number, reasonCode = "spam") =>
  report(who, "message", messageId, { reasonCode });

const rows = (sql: string, params: unknown[] = []) =>
  w.ds.query(sql, params) as Promise<Record<string, unknown>[]>;

const openCount = () =>
  count(w.ds, `SELECT count(*)::int FROM social_reports WHERE status = 'open'`);

const device = async (token: string) => {
  const endpoint = newEndpoint();
  const response = await callWith(
    w.app,
    "post",
    "/v1/push/subscriptions",
    token,
    { body: subscriptionBody(endpoint) },
  );

  expect(response.status).toBe(204);
  return endpoint;
};

describe("who may report a message", () => {
  it("lets a trainee report a PT message, with the reason code and the trimmed note", async () => {
    const id = await message(annConversation, "admin", "đừng lười");
    const response = await report("ann", "message", id, {
      reasonCode: "harassment",
      reason: "  quá đáng  ",
    });

    expect(response.status).toBe(204);
    expect(
      await rows(
        `SELECT target_kind, target_id, reason, reason_code, status, reporter_key
         FROM social_reports`,
      ),
    ).toEqual([
      {
        target_kind: "message",
        target_id: id,
        reason: "quá đáng",
        reason_code: "harassment",
        status: "open",
        reporter_key: `user:${w.ids.ann}`,
      },
    ]);
  });

  it("lets a PT report a message of a trainee in their workspace", async () => {
    const id = await message(annConversation, "user", "chửi bậy");

    expect((await reportMessage("ptA", id, "inappropriate")).status).toBe(204);
    expect((await reportMessage("ptA", id, "inappropriate")).status).toBe(204);
    expect(await openCount()).toBe(1);
  });

  it("refuses your own message, and a PT message reported by a PT", async () => {
    const own = await message(annConversation, "user");
    const ptMessage = await message(annConversation, "admin");

    expect((await reportMessage("ann", own)).status).toBe(404);
    expect((await reportMessage("ptA", ptMessage)).status).toBe(404);
    expect(await openCount()).toBe(0);
  });

  it("refuses a message of another trainee's conversation", async () => {
    const others = await message(benConversation, "admin");

    expect((await reportMessage("ann", others)).status).toBe(404);
    expect(await openCount()).toBe(0);
  });

  it("refuses a PT outside the workspace and a trainee the PT hid", async () => {
    const id = await message(annConversation, "user");

    expect((await reportMessage("ptB", id)).status).toBe(404);
    await hideTrainee(w.ds, w.ids.ptA, w.ids.ann);
    expect((await reportMessage("ptA", id)).status).toBe(404);
    await w.ds.query(`DELETE FROM admin_hidden_users`);
    expect(await openCount()).toBe(0);
    expect((await reportMessage("ptA", id)).status).toBe(204);
  });

  it("refuses a super admin: they read every chat and never report", async () => {
    const id = await message(annConversation, "user");
    const fromPt = await message(annConversation, "admin");

    expect((await reportMessage("superAdmin", id)).status).toBe(404);
    expect((await reportMessage("superAdmin", fromPt)).status).toBe(404);
  });

  it("refuses an unsent, a hidden and a missing message", async () => {
    const unsent = await message(annConversation, "admin", "", {
      deleted: true,
    });
    const hidden = await message(annConversation, "admin", "x", {
      hiddenBy: w.ids.superAdmin,
    });

    for (const id of [unsent, hidden, 999999]) {
      expect((await reportMessage("ann", id)).status, String(id)).toBe(404);
    }
    expect(await openCount()).toBe(0);
  });

  it("accepts group_message in the schema but has no endpoint for it yet", async () => {
    const response = await report("ann", "group_message", 1, {
      reasonCode: "spam",
    });

    expect(response.status).toBe(404);
    expect(await openCount()).toBe(0);
  });

  it("requires a valid reason code for a message", async () => {
    const id = await message(annConversation, "admin");
    const missing = await report("ann", "message", id);
    const unknown = await report("ann", "message", id, { reasonCode: "rude" });

    expect(missing.status).toBe(400);
    expect(JSON.stringify(missing.body)).toContain(
      SOCIAL_FRIEND_MESSAGES.REASON_REQUIRED,
    );
    expect(unknown.status).toBe(400);
    expect(await openCount()).toBe(0);
  });

  it("keeps a reason code optional for a post, comment or user", async () => {
    const response = await report("ann", "user", w.ids.ben, {
      reasonCode: "scam",
    });

    expect(response.status).toBe(204);
    expect((await report("ben", "user", w.ids.ann)).status).toBe(204);
    expect(
      await rows(`SELECT reason_code FROM social_reports ORDER BY id`),
    ).toEqual([{ reason_code: "scam" }, { reason_code: null }]);
  });
});

describe("the admin queue", () => {
  it("lists a message report with sender, preview, trainee, reason code and note", async () => {
    const text = await message(annConversation, "user", "  nội dung \n xấu ");

    await reportMessage("ptA", text, "harassment");
    await report("ptA", "message", await message(annConversation, "user"), {
      reasonCode: "other",
      reason: "ghi chú",
    });
    const response = await api.get("/reports", w.tokens.superAdmin);

    expect(response.status).toBe(200);
    expect(response.body.openCount).toBe(2);
    expect(response.body.items[0]).toMatchObject({
      targetKind: "message",
      targetId: text,
      reporterName: expect.any(String),
      reason: "",
      reasonCode: "harassment",
      preview: "nội dung xấu",
      targetName: "Ann",
      postId: null,
      message: {
        senderRole: "user",
        senderName: "Ann",
        traineeId: w.ids.ann,
        traineeName: "Ann",
        kind: "text",
      },
    });
    expect(response.body.items[1]).toMatchObject({
      reason: "ghi chú",
      reasonCode: "other",
    });
  });

  it("labels a sticker and a photo, and names the PT who wrote a message", async () => {
    const sticker = await message(annConversation, "admin", "", {
      stickerRef: "fluent:fire",
    });

    await reportMessage("ann", sticker, "scam");
    const photoUpload = await upload(
      w.app,
      "/v1/chat/photos",
      w.tokens.ann,
      pngBytes(),
    );
    const photoMessage = await callWith(
      w.app,
      "post",
      "/v1/chat/conversations/me/messages",
      w.tokens.ann,
      {
        body: { photoId: photoUpload.body.photo.id },
        headers: { "Idempotency-Key": newKey() },
      },
    );

    expect(photoMessage.status).toBe(201);
    await reportMessage("ptA", photoMessage.body.message.id, "inappropriate");
    const items = (await api.get("/reports", w.tokens.superAdmin)).body.items;

    expect(items[0]).toMatchObject({
      preview: "(Sticker)",
      message: { kind: "sticker", senderRole: "admin", traineeName: "Ann" },
    });
    expect(items[0].message.senderName).toBe(items[0].targetName);
    expect(items[1]).toMatchObject({
      preview: "(Ảnh)",
      message: { kind: "photo", senderRole: "user" },
    });
  });

  it("shows a report of an unsent message as gone, and an old report without a code", async () => {
    const id = await message(annConversation, "admin");

    await reportMessage("ann", id);
    await w.ds.query(
      `UPDATE chat_messages SET deleted_at = now() WHERE id = $1`,
      [id],
    );
    await w.ds.query(
      `INSERT INTO social_reports (reporter_key, target_kind, target_id, reason, status, created_at)
       VALUES ($1, 'user', $2, 'cũ', 'open', now())`,
      [`user:${w.ids.ben}`, w.ids.cat],
    );
    const items = (await api.get("/reports", w.tokens.superAdmin)).body.items;

    expect(items[0]).toMatchObject({
      targetKind: "message",
      preview: null,
      targetName: null,
      message: null,
    });
    expect(items[1]).toMatchObject({
      targetKind: "user",
      reasonCode: null,
      message: null,
    });
  });

  it("is for the super admin only", async () => {
    for (const who of ["ptA", "ann"] as const) {
      expect((await api.get("/reports", w.tokens[who])).status).toBe(403);
    }
  });
});

describe("resolving a message report", () => {
  const readers = async (id: number) => {
    const annThread = await callWith(
      w.app,
      "get",
      "/v1/chat/conversations/me/messages",
      w.tokens.ann,
    );
    const adminThread = await callWith(
      w.app,
      "get",
      `/v1/chat/conversations/${annConversation}/messages`,
      w.tokens.ptA,
    );
    const pick = (response: { body: { messages: { id: number }[] } }) =>
      response.body.messages.find((m) => m.id === id);

    return { trainee: pick(annThread), admin: pick(adminThread) };
  };

  it("keeps the message and closes every open report on it", async () => {
    const id = await message(annConversation, "admin", "giữ lại");

    await reportMessage("ann", id, "spam");
    await reportMessage("ptA", id).catch(() => undefined);
    const [first] = await rows(`SELECT id FROM social_reports`);
    const response = await api.post(
      `/reports/${first.id}/resolve`,
      w.tokens.superAdmin,
      { resolution: "kept" },
    );

    expect(response.status).toBe(204);
    expect(
      await rows(`SELECT status, resolution, resolved_by FROM social_reports`),
    ).toEqual([
      { status: "resolved", resolution: "kept", resolved_by: w.ids.superAdmin },
    ]);
    expect((await readers(id)).trainee).toMatchObject({
      body: "giữ lại",
      deleted: false,
    });
    expect(
      (
        await rows(
          `SELECT hidden_by_admin_id FROM chat_messages WHERE id = $1`,
          [id],
        )
      )[0],
    ).toEqual({ hidden_by_admin_id: null });
  });

  it("hides: sets hidden_by_admin_id, closes all open reports and redacts it for readers", async () => {
    const id = await message(annConversation, "user", "nội dung độc hại");

    await reportMessage("ptA", id, "harassment");
    await w.ds.query(
      `INSERT INTO social_reports (reporter_key, target_kind, target_id, reason_code, status, created_at)
       VALUES ('admin:${w.ids.ptB}', 'message', $1, 'spam', 'open', now())`,
      [id],
    );
    expect(await openCount()).toBe(2);
    const [first] = await rows(
      `SELECT id FROM social_reports ORDER BY id LIMIT 1`,
    );

    events.clear();
    const response = await api.post(
      `/reports/${first.id}/resolve`,
      w.tokens.superAdmin,
      { resolution: "hidden" },
    );

    expect(response.status).toBe(204);
    expect(
      (
        await rows(
          `SELECT hidden_by_admin_id, deleted_at, body FROM chat_messages WHERE id = $1`,
          [id],
        )
      )[0],
    ).toEqual({
      hidden_by_admin_id: w.ids.superAdmin,
      deleted_at: null,
      body: "nội dung độc hại",
    });
    expect(
      await rows(`SELECT DISTINCT status, resolution FROM social_reports`),
    ).toEqual([{ status: "resolved", resolution: "hidden" }]);
    expect(events.named("chat.message.deleted")).toHaveLength(1);
    expect(events.named("chat.message.deleted")[0].payload).toMatchObject({
      conversationId: annConversation,
      traineeUserId: w.ids.ann,
      messageId: id,
    });
    const { trainee, admin } = await readers(id);

    for (const view of [trainee, admin]) {
      expect(view).toMatchObject({
        id,
        body: "",
        deleted: true,
        sticker: null,
        photo: null,
        reactions: [],
      });
    }
  });

  it("applies the hide in search, gallery, inbox preview, reactions, edits and unsend", async () => {
    const id = await message(annConversation, "user", "cụm từ nhạy cảm");
    const other = await message(annConversation, "user", "cụm từ bình thường");

    const search = () =>
      callWith(
        w.app,
        "get",
        `/v1/chat/conversations/me/search?q=${encodeURIComponent("cụm từ")}`,
        w.tokens.ann,
      );

    expect(
      (await search()).body.results.map(
        (r: { messageId: number }) => r.messageId,
      ),
    ).toEqual([other, id]);
    await reportMessage("ptA", id);
    const [open] = await rows(`SELECT id FROM social_reports`);

    await api.post(`/reports/${open.id}/resolve`, w.tokens.superAdmin, {
      resolution: "hidden",
    });
    expect(
      (await search()).body.results.map(
        (r: { messageId: number }) => r.messageId,
      ),
    ).toEqual([other]);
    // The newest message of the conversation was hidden: no preview.
    await w.ds.query(
      `UPDATE chat_conversations SET last_message_id = $2 WHERE id = $1`,
      [annConversation, id],
    );
    const inbox = await callWith(w.app, "get", "/v1/chat/inbox", w.tokens.ptA);
    const row = inbox.body.conversations.find(
      (c: { userId: number }) => c.userId === w.ids.ann,
    );

    expect(row.preview).toBe("");
    // Nothing left to react to, edit or unsend.
    expect(
      (
        await callWith(
          w.app,
          "put",
          `/v1/chat/messages/${id}/reaction`,
          w.tokens.ptA,
          {
            body: { emoji: "👍" },
          },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await callWith(
          w.app,
          "patch",
          `/v1/chat/messages/${id}`,
          w.tokens.ann,
          {
            body: { body: "sửa" },
          },
        )
      ).status,
    ).toBe(409);
    const unsend = await callWith(
      w.app,
      "delete",
      `/v1/chat/messages/${id}`,
      w.tokens.ann,
    );

    expect(unsend.body.message).toMatchObject({ deleted: true, body: "" });
    expect(
      (
        await rows(`SELECT deleted_at FROM chat_messages WHERE id = $1`, [id])
      )[0],
    ).toEqual({ deleted_at: null });
  });

  it("keeps the photo bytes as evidence for admins only", async () => {
    const photoUpload = await upload(
      w.app,
      "/v1/chat/photos",
      w.tokens.ann,
      pngBytes(),
    );
    const sent = await callWith(
      w.app,
      "post",
      "/v1/chat/conversations/me/messages",
      w.tokens.ann,
      {
        body: { photoId: photoUpload.body.photo.id },
        headers: { "Idempotency-Key": newKey() },
      },
    );
    const photoUrl = sent.body.message.photo.url as string;

    await reportMessage("ptA", sent.body.message.id, "scam");
    const [open] = await rows(`SELECT id FROM social_reports`);

    await api.post(`/reports/${open.id}/resolve`, w.tokens.superAdmin, {
      resolution: "hidden",
    });
    expect((await callWith(w.app, "get", photoUrl, w.tokens.ann)).status).toBe(
      404,
    );
    expect((await callWith(w.app, "get", photoUrl, w.tokens.ptA)).status).toBe(
      200,
    );
    expect(
      await count(
        w.ds,
        `SELECT count(*)::int FROM chat_photos WHERE message_id IS NOT NULL`,
      ),
    ).toBeGreaterThan(0);
    const view = (
      await callWith(
        w.app,
        "get",
        "/v1/chat/conversations/me/messages",
        w.tokens.ann,
      )
    ).body.messages.find((m: { id: number }) => m.id === sent.body.message.id);

    expect(view).toMatchObject({ deleted: true, photo: null });
  });

  it("hides once: hiding again keeps the first admin and emits nothing", async () => {
    const id = await message(annConversation, "user");

    await reportMessage("ptA", id);
    const [open] = await rows(`SELECT id FROM social_reports`);

    await api.post(`/reports/${open.id}/resolve`, w.tokens.superAdmin, {
      resolution: "hidden",
    });
    await reportMessage("ptA", id).catch(() => undefined);
    // A second admin hiding the same message directly keeps the first one.
    const second = await rows(
      `INSERT INTO social_reports (reporter_key, target_kind, target_id, reason_code, status, created_at)
       VALUES ('admin:${w.ids.ptB}', 'message', $1, 'spam', 'open', now()) RETURNING id`,
      [id],
    );

    events.clear();
    expect(
      (
        await api.post(
          `/reports/${second[0].id}/resolve`,
          w.tokens.superAdmin,
          {
            resolution: "hidden",
          },
        )
      ).status,
    ).toBe(204);
    expect(events.named("chat.message.deleted")).toHaveLength(0);
    expect(
      (
        await rows(
          `SELECT hidden_by_admin_id FROM chat_messages WHERE id = $1`,
          [id],
        )
      )[0],
    ).toEqual({ hidden_by_admin_id: w.ids.superAdmin });
  });

  it("counts a message that is already gone as done", async () => {
    const id = await message(annConversation, "admin");

    await reportMessage("ann", id);
    await w.ds.query(
      `UPDATE chat_messages SET deleted_at = now() WHERE id = $1`,
      [id],
    );
    const [open] = await rows(`SELECT id FROM social_reports`);
    const response = await api.post(
      `/reports/${open.id}/resolve`,
      w.tokens.superAdmin,
      { resolution: "hidden" },
    );

    expect(response.status).toBe(204);
    expect(
      (
        await rows(
          `SELECT hidden_by_admin_id FROM chat_messages WHERE id = $1`,
          [id],
        )
      )[0],
    ).toEqual({ hidden_by_admin_id: null });
    expect(await openCount()).toBe(0);
  });

  it("refuses 'deleted' for a message and 'hidden' for anything else", async () => {
    const id = await message(annConversation, "admin");

    await reportMessage("ann", id);
    await report("ann", "user", w.ids.ben);
    const [messageReport, userReport] = await rows(
      `SELECT id FROM social_reports ORDER BY id`,
    );

    expect(
      (
        await api.post(
          `/reports/${messageReport.id}/resolve`,
          w.tokens.superAdmin,
          {
            resolution: "deleted",
          },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await api.post(
          `/reports/${userReport.id}/resolve`,
          w.tokens.superAdmin,
          {
            resolution: "hidden",
          },
        )
      ).status,
    ).toBe(403);
    expect(await openCount()).toBe(2);
    expect(
      (
        await rows(
          `SELECT hidden_by_admin_id FROM chat_messages WHERE id = $1`,
          [id],
        )
      )[0],
    ).toEqual({ hidden_by_admin_id: null });
  });

  it("is for the super admin only", async () => {
    const id = await message(annConversation, "admin");

    await reportMessage("ann", id);
    const [open] = await rows(`SELECT id FROM social_reports`);

    for (const who of ["ptA", "ann"] as const) {
      expect(
        (
          await api.post(`/reports/${open.id}/resolve`, w.tokens[who], {
            resolution: "hidden",
          })
        ).status,
      ).toBe(403);
    }
  });
});

describe("the super admin push", () => {
  it("tells every super admin once per new report, in their language, and nobody else", async () => {
    const second = await w.ds.query(
      `INSERT INTO admins (username, username_key, password_hash, role, locale)
       VALUES ('boss2', 'boss2', 'x', 'super_admin', 'en') RETURNING id`,
    );
    const boss = await device(w.tokens.superAdmin);
    const bossTwo = newEndpoint();

    await w.ds.query(
      `INSERT INTO push_subscriptions (owner_key, kind, endpoint, p256dh, auth, created_at)
       VALUES ($1, 'web', $2, 'p', 'a', now())`,
      [`admin:${second[0].id}`, bossTwo],
    );
    const pt = await device(w.tokens.ptA);
    const trainee = await device(w.tokens.ann);
    const id = await message(annConversation, "admin");

    await reportMessage("ann", id);
    await sender.waitForCalls(2);
    await pause(150);

    expect(sender.to(boss)).toHaveLength(1);
    expect(sender.to(bossTwo)).toHaveLength(1);
    expect(sender.to(pt)).toHaveLength(0);
    expect(sender.to(trainee)).toHaveLength(0);
    expect(sender.to(bossTwo)[0].payload).toEqual({
      title: "PT App",
      body: "New report: message",
      url: "/admin/reports",
      tag: "reports",
    });
    expect(sender.to(boss)[0].payload.body).toBe("Báo cáo mới: tin nhắn");
    // The push never carries the reported text.
    expect(JSON.stringify(sender.calls)).not.toContain("xin chào");
  });

  it("does not push for a duplicate or a refused report", async () => {
    await device(w.tokens.superAdmin);
    const id = await message(annConversation, "admin");

    await reportMessage("ann", id);
    await sender.waitForCalls(1);
    await reportMessage("ann", id);
    await reportMessage("ben", id);
    await pause(200);

    expect(sender.calls).toHaveLength(1);
  });

  it("pushes for the other kinds of report too", async () => {
    const boss = await device(w.tokens.superAdmin);

    await report("ann", "user", w.ids.ben);
    await sender.waitForCalls(1);

    expect(sender.to(boss)[0].payload.body).toBe("Báo cáo mới: người dùng");
  });
});

describe("account deletion", () => {
  it("removes the reports about the messages of the deleted trainee", async () => {
    const mine = await message(benConversation, "admin");
    const other = await message(annConversation, "admin");

    await reportMessage("ben", mine);
    await reportMessage("ann", other);
    await w.ds.transaction((manager) =>
      w.app.get(SocialCleanupService).deleteContentOfUser(manager, w.ids.ben),
    );

    expect(
      await rows(`SELECT target_id FROM social_reports ORDER BY id`),
    ).toEqual([{ target_id: other }]);
    // A PT's report about that trainee's messages goes too.
    const theirs = await message(patConversation, "user");

    await reportMessage("ptA", theirs).catch(() => undefined);
    await w.ds.query(
      `INSERT INTO social_reports (reporter_key, target_kind, target_id, reason_code, status, created_at)
       VALUES ('admin:${w.ids.ptP}', 'message', $1, 'spam', 'open', now())`,
      [theirs],
    );
    await w.ds.transaction((manager) =>
      w.app.get(SocialCleanupService).deleteContentOfUser(manager, w.ids.pat),
    );
    expect(
      await rows(`SELECT target_id FROM social_reports WHERE target_id = $1`, [
        theirs,
      ]),
    ).toEqual([]);
  });
});

describe("schema rules and the migration", () => {
  const sqlState = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return (error as { driverError?: { code?: string } }).driverError?.code;
    }
    return undefined;
  };
  const insert = (
    kind: string,
    reasonCode: string | null,
    resolution: string | null = null,
  ) =>
    w.ds.query(
      `INSERT INTO social_reports
         (reporter_key, target_kind, target_id, reason_code, status, resolution, resolved_at, created_at)
       VALUES ($1, $2, 1, $3, $4, $5, $6, now())`,
      [
        `user:${w.ids.cat}`,
        kind,
        reasonCode,
        resolution ? "resolved" : "open",
        resolution,
        resolution ? new Date() : null,
      ],
    );

  it("checks the reason code, the target kind and where hidden is allowed", async () => {
    // 23514 check_violation
    expect(await sqlState(insert("message", "rude"))).toBe("23514");
    expect(await sqlState(insert("dm", "spam"))).toBe("23514");
    expect(await sqlState(insert("message", null))).toBe("23514");
    expect(await sqlState(insert("group_message", null))).toBe("23514");
    expect(await sqlState(insert("post", "spam", "hidden"))).toBe("23514");
    expect(await sqlState(insert("message", "spam", "hidden"))).toBeUndefined();
    expect(await sqlState(insert("group_message", "scam"))).toBeUndefined();
    expect(await sqlState(insert("post", null))).toBeUndefined();
  });

  it("goes down and up again, deleting message reports and keeping the rest", async () => {
    const db = await createTestDatabase({ migrated: false });

    try {
      await db.dataSource.runMigrations({ transaction: "each" });
      const user = (
        await db.dataSource.query(
          `INSERT INTO users (name, name_key) VALUES ('a', 'a') RETURNING id`,
        )
      )[0].id;

      await db.dataSource.query(
        `INSERT INTO social_reports (reporter_key, target_kind, target_id, reason_code, status, created_at)
         VALUES ('user:${user}', 'user', ${user}, 'spam', 'open', now()),
                ('user:${user}', 'message', 7, 'spam', 'open', now())`,
      );
      // Undo every migration after ReportMessages, then ReportMessages itself.
      const after =
        migrations.length -
        migrations.findIndex(
          (migration) => migration.name === "ReportMessages1795600000000",
        );

      for (let i = 0; i < after; i += 1) {
        await db.dataSource.undoLastMigration({ transaction: "each" });
      }

      expect(
        await db.dataSource.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'social_reports' AND column_name = 'reason_code'`,
        ),
      ).toEqual([]);
      expect(
        await db.dataSource.query(`SELECT target_kind FROM social_reports`),
      ).toEqual([{ target_kind: "user" }]);
      expect(
        await sqlState(
          db.dataSource.query(
            `INSERT INTO social_reports (reporter_key, target_kind, target_id, status, created_at)
             VALUES ('user:${user}', 'message', 9, 'open', now())`,
          ),
        ),
      ).toBe("23514");
      await db.dataSource.runMigrations({ transaction: "each" });
      expect(
        await db.dataSource.query(`SELECT reason_code FROM social_reports`),
      ).toEqual([{ reason_code: null }]);
    } finally {
      await db.drop();
    }
  });
});
