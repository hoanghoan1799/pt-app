import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { callWith, pngBytes } from "./support/chat.js";
import {
  adminIn,
  createGroupWorld,
  destroyGroupWorld,
  groupsApi,
  type GroupWorld,
  memberRow,
  type Person,
  systemLines,
  traineeIn,
} from "./support/groups.js";
import { acceptTerms } from "./support/social.js";

// Port of company group-system-lines (PT-change alert, dissolve),
// group-cleanup and social-report-group-messages against the real API and
// PostgreSQL.

let w: GroupWorld;
let api: ReturnType<typeof groupsApi>;
let superAdmin: Person;
let secondSuper: Person;
let pt: Person;
let newPt: Person;

beforeAll(async () => {
  w = await createGroupWorld();
  api = groupsApi(w);
  superAdmin = await adminIn(w, "super_admin");
  secondSuper = await adminIn(w, "super_admin");
  pt = await adminIn(w, "pt");
  newPt = await adminIn(w, "pt");
});

afterAll(async () => {
  await destroyGroupWorld(w);
});

const assignPt = (userId: number, ptAdminId: number | null) =>
  callWith(w.app, "put", `/v1/trainees/${userId}/pt`, superAdmin.token, {
    body: { ptAdminId },
  });

const alertsOf = async (groupId: number) =>
  (await systemLines(w, groupId)).filter((line) => line.audience !== null);

describe("PT-change alert (G17)", () => {
  it("writes one super-admin-only alert per active group that has the trainee", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const a = await api.createId(pt.token, { userIds: [ann.id] });
    const b = await api.createId(superAdmin.token, { userIds: [ann.id] });
    const left = await api.createId(pt.token, { userIds: [ann.id] });
    const dissolved = await api.createId(pt.token, { userIds: [ann.id] });
    const without = await api.createId(pt.token);

    await api.leave(ann.token, left);
    await api.dissolve(superAdmin.token, dissolved);
    const lastBefore = await w.ds.query(
      `SELECT id, last_message_id FROM chat_groups WHERE id = ANY($1::int[]) ORDER BY id`,
      [[a, b]],
    );

    expect((await assignPt(ann.id, newPt.id)).status).toBe(204);
    for (const groupId of [a, b]) {
      expect((await alertsOf(groupId)).map((line) => line.event)).toEqual([
        {
          type: "pt_changed",
          userId: ann.id,
          fromPtId: pt.id,
          toPtId: newPt.id,
          resolution: null,
        },
      ]);
    }
    for (const groupId of [left, dissolved, without]) {
      expect(await alertsOf(groupId)).toEqual([]);
    }
    // An alert never moves the inbox pointer.
    expect(
      await w.ds.query(
        `SELECT id, last_message_id FROM chat_groups WHERE id = ANY($1::int[]) ORDER BY id`,
        [[a, b]],
      ),
    ).toEqual(lastBefore);
  });

  it("writes nothing when the PT did not change", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });

    expect((await assignPt(ann.id, pt.id)).status).toBe(204);
    expect(await alertsOf(groupId)).toEqual([]);
  });

  it("supersedes an older unresolved alert for the same trainee and keeps resolved ones", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const ben = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, {
      userIds: [ann.id, ben.id],
    });

    await assignPt(ann.id, newPt.id);
    await assignPt(ben.id, newPt.id);
    await assignPt(ann.id, pt.id);
    const alerts = await alertsOf(groupId);

    expect(
      alerts.map((line) => [
        line.event.userId,
        (line.event.resolution as { choice: string } | null)?.choice ?? null,
      ]),
    ).toEqual([
      [ann.id, "superseded"],
      [ben.id, null],
      [ann.id, null],
    ]);
    const superseded = alerts[0];
    const refused = await api.resolve(
      superAdmin.token,
      groupId,
      superseded.id,
      "keep",
    );

    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("GROUP_ALERT_HANDLED");
  });

  it("never reaches the trainee, a PT, the unread count, the preview or seen-by", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });

    await assignPt(ann.id, newPt.id);
    const alert = (await alertsOf(groupId))[0];

    for (const person of [ann, pt]) {
      const thread = await api.thread(person.token, groupId);

      expect(
        thread.body.messages.some((m: { id: number }) => m.id === alert.id),
      ).toBe(false);
      expect(
        (
          await api.thread(person.token, groupId, "?changedSince=0")
        ).body.changes.some((m: { id: number }) => m.id === alert.id),
      ).toBe(false);
      expect((await api.seen(person.token, groupId, alert.id)).status).toBe(
        404,
      );
      expect(
        (await api.resolve(person.token, groupId, alert.id, "keep")).status,
      ).toBe(403);
    }
    const asSuper = (await api.thread(superAdmin.token, groupId)).body.messages;

    expect(
      asSuper.find((m: { id: number }) => m.id === alert.id),
    ).toMatchObject({
      kind: "system",
      audience: "super_admin",
      systemEvent: { type: "pt_changed", userId: ann.id },
    });
    const summary = (await api.list(superAdmin.token)).body.groups.find(
      (g: { id: number }) => g.id === groupId,
    );

    expect(summary.lastMessage.systemEvent.type).toBe("member_added");
    expect(
      (await api.unread(superAdmin.token)).body.perGroup.find(
        (row: { groupId: number }) => row.groupId === groupId,
      ),
    ).toBeUndefined();
  });

  it("keeps the trainee and records who chose", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });

    await assignPt(ann.id, newPt.id);
    const alert = (await alertsOf(groupId))[0];

    expect(
      (await api.resolve(superAdmin.token, groupId, alert.id, "keep")).status,
    ).toBe(204);
    expect((await alertsOf(groupId))[0].event.resolution).toMatchObject({
      choice: "keep",
      byAdminId: superAdmin.id,
    });
    expect((await memberRow(w, groupId, ann.key))?.left_at).toBeNull();
  });

  it("removes the trainee with the normal removed line", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });

    await assignPt(ann.id, newPt.id);
    const alert = (await alertsOf(groupId))[0];

    await api.resolve(superAdmin.token, groupId, alert.id, "remove");
    expect(await memberRow(w, groupId, ann.key)).toMatchObject({
      removed_by_key: superAdmin.key,
    });
    expect((await systemLines(w, groupId)).at(-1)?.event).toEqual({
      type: "member_removed",
      actorKey: superAdmin.key,
      memberKey: ann.key,
    });
    expect((await api.thread(ann.token, groupId)).status).toBe(404);
  });

  it("resolves once: a second tap and a second super admin are told who handled it", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });

    await assignPt(ann.id, newPt.id);
    const alert = (await alertsOf(groupId))[0];

    await api.resolve(superAdmin.token, groupId, alert.id, "keep");
    for (const person of [superAdmin, secondSuper]) {
      const again = await api.resolve(
        person.token,
        groupId,
        alert.id,
        "remove",
      );

      expect(again.status).toBe(409);
      expect(again.body).toMatchObject({
        code: "GROUP_ALERT_HANDLED",
        details: { handledBy: superAdmin.name },
      });
    }
    expect((await memberRow(w, groupId, ann.key))?.left_at).toBeNull();
  });

  it("lets only one of two concurrent resolves win", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });

    await assignPt(ann.id, newPt.id);
    const alert = (await alertsOf(groupId))[0];
    const results = await Promise.all([
      api.resolve(superAdmin.token, groupId, alert.id, "keep"),
      api.resolve(secondSuper.token, groupId, alert.id, "remove"),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
  });

  it("answers not found for an ordinary line, a message of another group and bad ids", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });
    const other = await api.createId(pt.token, { userIds: [ann.id] });

    await assignPt(ann.id, newPt.id);
    const alert = (await alertsOf(groupId))[0];
    const line = (await systemLines(w, groupId))[0];
    const mid = await api.sendId(ann.token, groupId);

    for (const id of [line.id, mid]) {
      expect(
        (await api.resolve(superAdmin.token, groupId, id, "keep")).body.code,
      ).toBe("GROUP_ALERT_NOT_FOUND");
    }
    expect(
      (await api.resolve(superAdmin.token, other, alert.id, "keep")).status,
    ).toBe(404);
    expect(
      (await api.resolve(superAdmin.token, 999_999, alert.id, "keep")).status,
    ).toBe(404);
    expect(
      (await api.resolve(superAdmin.token, groupId, alert.id, "maybe")).status,
    ).toBe(400);
  });
});

describe("PT-change alert in a dissolved group", () => {
  it("cannot be resolved once the group is dissolved", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });

    await assignPt(ann.id, newPt.id);
    const alert = (await alertsOf(groupId))[0];

    await api.dissolve(superAdmin.token, groupId);
    expect(
      (await api.resolve(superAdmin.token, groupId, alert.id, "remove")).status,
    ).toBe(404);
    expect((await memberRow(w, groupId, ann.key))?.left_at).toBeNull();
    expect((await alertsOf(groupId))[0].event.resolution).toBeNull();
  });
});

describe("cleanup on delete (company group-cleanup)", () => {
  it("deleting a trainee removes member rows, reactions and pending photos, and keeps messages as a deleted member", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const ben = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, {
      userIds: [ann.id, ben.id],
    });
    const attached = (await api.upload(ann.token, groupId, pngBytes())).body
      .photo.id as number;
    const pending = (await api.upload(ann.token, groupId, pngBytes())).body
      .photo.id as number;
    const mid = (
      await api.send(ann.token, groupId, {
        body: "from ann",
        photoIds: [attached],
      })
    ).body.message.id as number;
    const bens = await api.sendId(ben.token, groupId);

    await api.react(ann.token, groupId, bens, "👍");
    await api.read(ann.token, groupId, bens);
    expect(
      (await callWith(w.app, "delete", `/v1/trainees/${ann.id}`, pt.token))
        .status,
    ).toBe(204);
    expect(await memberRow(w, groupId, ann.key)).toBeNull();
    expect(
      await w.ds.query(
        `SELECT 1 FROM chat_group_reactions WHERE reactor_key = $1`,
        [ann.key],
      ),
    ).toEqual([]);
    expect(
      await w.ds.query(
        `SELECT id FROM chat_group_photos WHERE id = ANY($1::int[]) ORDER BY id`,
        [[attached, pending]],
      ),
    ).toEqual([{ id: attached }]);
    const view = (await api.thread(ben.token, groupId)).body.messages.find(
      (m: { id: number }) => m.id === mid,
    );

    expect(view).toMatchObject({
      senderKey: ann.key,
      senderName: null,
      senderDeleted: true,
      body: "from ann",
    });
    // Other members are untouched.
    expect((await memberRow(w, groupId, ben.key))?.left_at).toBeNull();
  });

  it("deleting a PT account removes their member and state rows and keeps their messages and the group", async () => {
    const creator = await adminIn(w, "pt");
    const ann = await traineeIn(w, { ptAdminId: creator.id });
    const groupId = await api.createId(creator.token, { userIds: [ann.id] });
    const mid = await api.sendId(creator.token, groupId, { body: "from pt" });

    await api.react(creator.token, groupId, mid, "❤️");
    // No admin delete route exists yet; the foreign keys of the generated
    // member and reactor columns do the cleanup.
    await w.ds.query(`DELETE FROM admins WHERE id = $1`, [creator.id]);
    expect(await memberRow(w, groupId, creator.key)).toBeNull();
    const thread = await api.thread(ann.token, groupId);

    expect(thread.status).toBe(200);
    const view = thread.body.messages.find((m: { id: number }) => m.id === mid);

    expect(view).toMatchObject({ senderDeleted: true, reactions: [] });
    // The dangling creator key leaves the group to the super admins (G6).
    expect(
      (await api.info(superAdmin.token, groupId)).body.viewer.canManage,
    ).toBe(true);
    expect((await api.rename(superAdmin.token, groupId, "Kept")).status).toBe(
      204,
    );
  });
});

describe("reporting a group message (G15, company social-report-group-messages)", () => {
  const report = (token: string, targetId: number, reasonCode = "spam") =>
    callWith(w.app, "post", "/v1/social/reports", token, {
      body: { targetKind: "group_message", targetId, reasonCode },
    });

  it("lets a member report another member's live message, and nothing else", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const ben = await traineeIn(w, { ptAdminId: pt.id });
    const outsider = await traineeIn(w, { ptAdminId: pt.id });

    for (const person of [ann, ben, outsider]) {
      await acceptTerms(w.ds, person.id);
    }
    const groupId = await api.createId(pt.token, {
      userIds: [ann.id, ben.id],
    });
    const bens = await api.sendId(ben.token, groupId, { body: "spammy" });
    const own = await api.sendId(ann.token, groupId);
    const unsent = await api.sendId(ben.token, groupId);
    const line = (await systemLines(w, groupId))[0].id;

    await api.unsend(ben.token, groupId, unsent);
    expect((await report(ann.token, bens)).status).toBe(204);
    expect((await report(pt.token, bens)).status).toBe(204);
    for (const [token, id] of [
      [ann.token, own],
      [ann.token, unsent],
      [ann.token, line],
      [outsider.token, bens],
      [superAdmin.token, bens],
      [ann.token, 999_999],
    ] as const) {
      expect((await report(token, id)).status).toBe(404);
    }
    const rows = await w.ds.query(
      `SELECT reporter_key, target_kind, reason_code FROM social_reports
       WHERE target_kind = 'group_message' AND target_id = $1 ORDER BY id`,
      [bens],
    );

    expect(rows).toEqual([
      {
        reporter_key: ann.key,
        target_kind: "group_message",
        reason_code: "spam",
      },
      {
        reporter_key: pt.key,
        target_kind: "group_message",
        reason_code: "spam",
      },
    ]);
    // A left member cannot report any more.
    await api.leave(ann.token, groupId);
    const later = await api.sendId(ben.token, groupId);

    expect((await report(ann.token, later)).status).toBe(404);
  });

  it("shows the report in the queue with its group, and the hide resolution hides it for everyone", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id, name: "Reporter" });
    const ben = await traineeIn(w, { ptAdminId: pt.id, name: "Sender" });

    await acceptTerms(w.ds, ann.id);
    const groupId = await api.createId(pt.token, {
      name: "Queue group",
      userIds: [ann.id, ben.id],
    });
    const mid = await api.sendId(ben.token, groupId, { body: "bad words" });

    await report(ann.token, mid);
    const queue = await callWith(
      w.app,
      "get",
      "/v1/social/reports",
      superAdmin.token,
    );
    const item = queue.body.items.find(
      (i: { targetId: number; targetKind: string }) =>
        i.targetKind === "group_message" && i.targetId === mid,
    );

    expect(item).toMatchObject({
      reporterName: "Reporter",
      preview: "bad words",
      targetName: "Sender",
      group: { id: groupId, name: "Queue group" },
      message: {
        senderRole: "user",
        senderName: "Sender",
        traineeId: ben.id,
        kind: "text",
      },
    });
    expect(
      (
        await callWith(
          w.app,
          "post",
          `/v1/social/reports/${item.id}/resolve`,
          superAdmin.token,
          { body: { resolution: "deleted" } },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await callWith(
          w.app,
          "post",
          `/v1/social/reports/${item.id}/resolve`,
          superAdmin.token,
          { body: { resolution: "hidden" } },
        )
      ).status,
    ).toBe(204);
    const view = (await api.thread(ann.token, groupId)).body.messages.find(
      (m: { id: number }) => m.id === mid,
    );

    expect(view).toMatchObject({ hidden: true, body: "" });
    const row = await w.ds.query(
      `SELECT hidden_by_key FROM chat_group_messages WHERE id = $1`,
      [mid],
    );

    expect(row[0].hidden_by_key).toBe(superAdmin.key);
  });
});
