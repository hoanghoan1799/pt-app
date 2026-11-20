import { GROUP_MEMBER_CAP } from "@pt/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hideTrainee } from "./support/auth.js";
import { newKey, pngBytes } from "./support/chat.js";
import {
  adminIn,
  bareTrainees,
  createGroupWorld,
  destroyGroupWorld,
  groupsApi,
  type GroupWorld,
  memberRow,
  type Person,
  restrict,
  systemLines,
  traineeIn,
} from "./support/groups.js";

// Port of company features/chat-groups/services/__tests__ (group-access,
// group-actions, group-candidates, group-mutations, group-queries,
// group-routes) against the real API and PostgreSQL.

let w: GroupWorld;
let api: ReturnType<typeof groupsApi>;
let superAdmin: Person;
let pt: Person;
let otherPt: Person;
let ann: Person;
let ben: Person;
let cat: Person;

beforeAll(async () => {
  w = await createGroupWorld();
  api = groupsApi(w);
  superAdmin = await adminIn(w, "super_admin");
  pt = await adminIn(w, "pt");
  otherPt = await adminIn(w, "pt");
  ann = await traineeIn(w, { ptAdminId: pt.id, name: "Ann" });
  ben = await traineeIn(w, { ptAdminId: pt.id, name: "Ben" });
  cat = await traineeIn(w, { ptAdminId: otherPt.id, name: "Cat" });
});

afterAll(async () => {
  await destroyGroupWorld(w);
});

const avatarUrl = `data:image/png;base64,${pngBytes(256, 256).toString("base64")}`;

// A PT group with Ann and Ben, created by `pt`.
const ptGroup = () => api.createId(pt.token, { userIds: [ann.id, ben.id] });

describe("create (G1, G3)", () => {
  it("lets a super admin create a group with trainees and a PT", async () => {
    const response = await api.create(superAdmin.token, {
      name: "  Lớp   sáng ",
      userIds: [ann.id, cat.id],
      ptIds: [pt.id],
    });

    expect(response.status).toBe(201);
    expect(response.body.results).toEqual([
      { kind: "user", id: ann.id, outcome: "added" },
      { kind: "user", id: cat.id, outcome: "added" },
      { kind: "admin", id: pt.id, outcome: "added" },
    ]);
    const groupId = response.body.groupId as number;
    const info = await api.info(superAdmin.token, groupId);

    expect(info.body.group.name).toBe("Lớp sáng");
    // The super admin is implicit: no member row of their own.
    expect(await memberRow(w, groupId, superAdmin.key)).toBeNull();
    expect(
      info.body.members.map((m: { key: string; role: string }) => [
        m.key,
        m.role,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [superAdmin.key, "super_admin"],
        [ann.key, "trainee"],
        [cat.key, "trainee"],
        [pt.key, "pt"],
      ]),
    );
    const lines = await systemLines(w, groupId);

    expect(lines.map((line) => line.event)).toEqual([
      {
        type: "member_added",
        actorKey: superAdmin.key,
        memberKeys: [ann.key, cat.key, pt.key],
      },
    ]);
  });

  it("adds a PT creator as an explicit member and keeps to their own trainees", async () => {
    const response = await api.create(pt.token, {
      name: "PT group",
      userIds: [ann.id, cat.id],
      ptIds: [otherPt.id],
    });

    expect(response.status).toBe(201);
    expect(response.body.results).toEqual([
      { kind: "user", id: ann.id, outcome: "added" },
      { kind: "user", id: cat.id, outcome: "out_of_scope" },
      { kind: "admin", id: otherPt.id, outcome: "out_of_scope" },
    ]);
    const groupId = response.body.groupId as number;
    const creator = await memberRow(w, groupId, pt.key);

    expect(creator).toMatchObject({ left_at: null, added_by_key: pt.key });
    expect(await memberRow(w, groupId, cat.key)).toBeNull();
    const info = await api.info(pt.token, groupId);

    expect(info.body.viewer).toMatchObject({
      role: "pt",
      canManage: true,
      isManager: true,
    });
    expect(
      info.body.members.find((m: { key: string }) => m.key === pt.key)
        ?.isCreator,
    ).toBe(true);
  });

  it("rejects an invalid name and creates nothing", async () => {
    const before = await w.ds.query(
      `SELECT count(*)::int AS n FROM chat_groups`,
    );

    for (const name of ["   ", "a".repeat(61), 12, "bad\u0000name"]) {
      expect((await api.create(pt.token, { name })).status).toBe(400);
    }
    const after = await w.ds.query(
      `SELECT count(*)::int AS n FROM chat_groups`,
    );

    expect(after[0].n).toBe(before[0].n);
  });

  it("refuses a trainee", async () => {
    expect((await api.create(ann.token, { name: "Mine" })).status).toBe(403);
  });
});

describe("add members (G1, G3, G9)", () => {
  it("skips bad, unknown, duplicate and non-trainee ids per id", async () => {
    const groupId = await api.createId(superAdmin.token);
    const response = await api.add(superAdmin.token, groupId, {
      userIds: [ann.id, ann.id, -1, "x", 999_999, 1.5],
      ptIds: [superAdmin.id, 999_999],
    });

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([
      { kind: "user", id: ann.id, outcome: "added" },
      { kind: "user", id: -1, outcome: "invalid" },
      { kind: "user", id: "x", outcome: "invalid" },
      { kind: "user", id: 999_999, outcome: "not_found" },
      { kind: "user", id: 1.5, outcome: "invalid" },
      { kind: "admin", id: superAdmin.id, outcome: "not_trainee" },
      { kind: "admin", id: 999_999, outcome: "not_found" },
    ]);
  });

  it("reports an already active member and does not add a second row", async () => {
    const groupId = await ptGroup();
    const response = await api.add(pt.token, groupId, { userIds: [ann.id] });

    expect(response.body.results).toEqual([
      { kind: "user", id: ann.id, outcome: "already_member" },
    ]);
    const rows = await w.ds.query(
      `SELECT count(*)::int AS n FROM chat_group_members WHERE group_id = $1 AND member_key = $2`,
      [groupId, ann.key],
    );

    expect(rows[0].n).toBe(1);
    // Nothing added: no line either.
    expect((await systemLines(w, groupId)).length).toBe(1);
  });

  it("keeps a PT to own trainees that are not hidden (revealed or not)", async () => {
    const hidden = await traineeIn(w, { ptAdminId: pt.id });

    await hideTrainee(w.ds, pt.id, hidden.id);
    const groupId = await ptGroup();
    const response = await api.add(pt.token, groupId, {
      userIds: [hidden.id, cat.id],
    });

    expect(response.body.results).toEqual([
      { kind: "user", id: hidden.id, outcome: "out_of_scope" },
      { kind: "user", id: cat.id, outcome: "out_of_scope" },
    ]);
    // The picker leaves the hidden one out too, and never offers PTs.
    const candidates = await api.candidates(pt.token);

    expect(candidates.status).toBe(200);
    const keys = candidates.body.trainees.map((c: { key: string }) => c.key);

    expect(keys).toContain(ann.key);
    expect(keys).not.toContain(hidden.key);
    expect(keys).not.toContain(cat.key);
    expect(candidates.body.pts).toEqual([]);
  });

  it("offers a super admin every trainee and PT, minus current members", async () => {
    const groupId = await api.createId(superAdmin.token, {
      userIds: [ann.id],
      ptIds: [pt.id],
    });
    const response = await api.candidates(superAdmin.token, groupId);
    const trainees = response.body.trainees.map((c: { key: string }) => c.key);
    const pts = response.body.pts.map((c: { key: string }) => c.key);

    expect(trainees).toEqual(expect.arrayContaining([ben.key, cat.key]));
    expect(trainees).not.toContain(ann.key);
    expect(pts).toContain(otherPt.key);
    expect(pts).not.toContain(pt.key);
    expect(pts).not.toContain(superAdmin.key);
    expect((await api.candidates(ann.token)).status).toBe(403);
  });

  it("accepts 49 to 50 members and refuses 50 to 51", async () => {
    const groupId = await api.createId(superAdmin.token);
    const many = await bareTrainees(w, GROUP_MEMBER_CAP);
    const first = await api.add(superAdmin.token, groupId, {
      userIds: many.slice(0, 49).map((p) => p.id),
    });

    expect(
      first.body.results.every(
        (r: { outcome: string }) => r.outcome === "added",
      ),
    ).toBe(true);
    const fiftieth = await api.add(superAdmin.token, groupId, {
      userIds: [many[49].id, ann.id],
    });

    expect(fiftieth.status).toBe(200);
    expect(fiftieth.body.results).toEqual([
      { kind: "user", id: many[49].id, outcome: "added" },
      { kind: "user", id: ann.id, outcome: "cap_reached" },
    ]);
    const full = await api.add(superAdmin.token, groupId, {
      userIds: [ann.id],
    });

    expect(full.status).toBe(409);
    expect(full.body.code).toBe("GROUP_FULL");
    // A super admin's own state row never counts against the cap.
    await api.mute(superAdmin.token, groupId, true);
    expect(await memberRow(w, groupId, superAdmin.key)).not.toBeNull();
    await api.remove(superAdmin.token, groupId, many[0].key);
    const again = await api.add(superAdmin.token, groupId, {
      userIds: [ann.id],
    });

    expect(again.body.results).toEqual([
      { kind: "user", id: ann.id, outcome: "added" },
    ]);
  });

  it("does not let two parallel adds both take the last place", async () => {
    const groupId = await api.createId(superAdmin.token);
    const many = await bareTrainees(w, GROUP_MEMBER_CAP + 1);

    await api.add(superAdmin.token, groupId, {
      userIds: many.slice(0, GROUP_MEMBER_CAP - 1).map((p) => p.id),
    });
    await Promise.all([
      api.add(superAdmin.token, groupId, { userIds: [many[49].id] }),
      api.add(superAdmin.token, groupId, { userIds: [many[50].id] }),
    ]);
    const rows = await w.ds.query(
      `SELECT count(*)::int AS n FROM chat_group_members WHERE group_id = $1 AND left_at IS NULL`,
      [groupId],
    );

    expect(rows[0].n).toBe(GROUP_MEMBER_CAP);
  });

  it("refuses a PT member who is not the creator and a stranger PT", async () => {
    const groupId = await api.createId(superAdmin.token, {
      userIds: [ann.id],
      ptIds: [pt.id],
    });

    const asMember = await api.add(pt.token, groupId, { userIds: [ben.id] });

    expect(asMember.status).toBe(403);
    expect(asMember.body.code).toBe("GROUP_NOT_MANAGER");
    expect(
      (await api.add(otherPt.token, groupId, { userIds: [cat.id] })).status,
    ).toBe(404);
  });

  it("answers not found for an unknown group instead of crashing", async () => {
    expect(
      (await api.add(superAdmin.token, 999_999, { userIds: [ann.id] })).status,
    ).toBe(404);
    expect((await api.info(superAdmin.token, 999_999)).status).toBe(404);
  });
});

describe("access per role (G2, G6, G7)", () => {
  it("lets members, the creator and every super admin in, and nobody else", async () => {
    const groupId = await ptGroup();

    for (const person of [pt, ann, ben, superAdmin]) {
      expect((await api.thread(person.token, groupId)).status).toBe(200);
    }
    for (const person of [cat, otherPt]) {
      const response = await api.thread(person.token, groupId);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("GROUP_NOT_FOUND");
    }
    expect((await api.thread(pt.token, 999_999)).status).toBe(404);
    expect((await api.call("get", "/abc/messages", pt.token)).status).toBe(400);
  });

  it("reports the viewer's rights with the thread", async () => {
    const groupId = await ptGroup();
    const asTrainee = await api.thread(ann.token, groupId);
    const asSuper = await api.thread(superAdmin.token, groupId);

    expect(asTrainee.body.viewer).toEqual({
      key: ann.key,
      role: "trainee",
      isManager: false,
      canManage: false,
      isSuperAdmin: false,
      muted: false,
      sendBlock: null,
    });
    expect(asSuper.body.viewer).toMatchObject({
      role: "super_admin",
      canManage: true,
      isSuperAdmin: true,
    });
  });
});

describe("remove, leave and rejoin (G7, G8)", () => {
  it("lets the creator PT remove a trainee with a removed line", async () => {
    const groupId = await ptGroup();
    const response = await api.remove(pt.token, groupId, ann.key);

    expect(response.status).toBe(204);
    expect(await memberRow(w, groupId, ann.key)).toMatchObject({
      removed_by_key: pt.key,
    });
    expect((await systemLines(w, groupId)).at(-1)?.event).toEqual({
      type: "member_removed",
      actorKey: pt.key,
      memberKey: ann.key,
    });
    // Read access is gone at once.
    expect((await api.thread(ann.token, groupId)).status).toBe(404);
    // A second removal is "not found", nothing more is written.
    expect((await api.remove(pt.token, groupId, ann.key)).status).toBe(404);
  });

  it("refuses to remove a super admin, a non-member and a bad key", async () => {
    const groupId = await ptGroup();
    const superRemove = await api.remove(pt.token, groupId, superAdmin.key);

    expect(superRemove.status).toBe(403);
    expect(superRemove.body.code).toBe("GROUP_CANNOT_REMOVE_MANAGER");
    expect((await api.remove(pt.token, groupId, cat.key)).status).toBe(404);
    expect((await api.remove(pt.token, groupId, "user:0")).status).toBe(400);
    expect((await api.remove(ann.token, groupId, ben.key)).status).toBe(403);
  });

  it("lets a trainee leave, keeps history and cursor, and blocks them until re-added", async () => {
    const groupId = await ptGroup();
    const mid = await api.sendId(pt.token, groupId, { body: "before" });

    await api.read(ann.token, groupId, mid);
    expect((await api.leave(ann.token, groupId)).status).toBe(204);
    expect(await memberRow(w, groupId, ann.key)).toMatchObject({
      removed_by_key: null,
      last_read_message_id: mid,
    });
    expect((await systemLines(w, groupId)).at(-1)?.event).toEqual({
      type: "member_left",
      memberKey: ann.key,
    });
    expect((await api.thread(ann.token, groupId)).status).toBe(404);
    expect((await api.send(ann.token, groupId, { body: "hi" })).status).toBe(
      404,
    );
    expect((await api.list(ann.token)).body.groups).not.toContainEqual(
      expect.objectContaining({ id: groupId }),
    );
    expect((await api.leave(ann.token, groupId)).status).toBe(404);

    const readd = await api.add(pt.token, groupId, { userIds: [ann.id] });

    expect(readd.body.results[0].outcome).toBe("added");
    const row = await memberRow(w, groupId, ann.key);

    expect(row).toMatchObject({
      left_at: null,
      removed_by_key: null,
      last_read_message_id: mid,
    });
    // The full history is readable again (G8).
    const thread = await api.thread(ann.token, groupId);

    expect(thread.body.messages.some((m: { id: number }) => m.id === mid)).toBe(
      true,
    );
  });

  it("does not let a super admin leave, but lets a PT member leave", async () => {
    const groupId = await api.createId(superAdmin.token, { ptIds: [pt.id] });
    const superLeave = await api.leave(superAdmin.token, groupId);

    expect(superLeave.status).toBe(403);
    expect(superLeave.body.code).toBe("GROUP_MANAGER_CANNOT_LEAVE");
    expect((await api.leave(pt.token, groupId)).status).toBe(204);
  });

  it("starts a new member at the newest message and a member of an empty group at NULL", async () => {
    const empty = await api.createId(pt.token);

    expect(
      (await memberRow(w, empty, pt.key))?.last_read_message_id,
    ).toBeNull();
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });
    const mid = await api.sendId(pt.token, groupId);

    await api.add(pt.token, groupId, { userIds: [ben.id] });
    expect((await memberRow(w, groupId, ben.key))?.last_read_message_id).toBe(
      mid,
    );
  });
});

describe("rename, managers-only, photo, mute", () => {
  it("renames with a trimmed name and one line, and a same name is a no-op", async () => {
    const groupId = await ptGroup();

    expect((await api.rename(pt.token, groupId, "  New   name ")).status).toBe(
      204,
    );
    expect((await api.rename(pt.token, groupId, "New name")).status).toBe(204);
    const lines = await systemLines(w, groupId);

    expect(lines.filter((l) => l.event.type === "renamed")).toEqual([
      expect.objectContaining({
        event: {
          type: "renamed",
          actorKey: pt.key,
          from: "Morning crew",
          to: "New name",
        },
      }),
    ]);
  });

  it("lets only managers change the group", async () => {
    const groupId = await api.createId(superAdmin.token, {
      userIds: [ann.id],
      ptIds: [pt.id],
    });

    expect((await api.rename(pt.token, groupId, "X")).status).toBe(403);
    expect((await api.managersOnly(pt.token, groupId, true)).status).toBe(403);
    expect((await api.setAvatar(pt.token, groupId, avatarUrl)).status).toBe(
      403,
    );
    expect((await api.rename(ann.token, groupId, "X")).status).toBe(403);
    expect((await api.rename(superAdmin.token, groupId, "X")).status).toBe(204);
  });

  it("switches managers-only once per change with a line", async () => {
    const groupId = await ptGroup();

    await api.managersOnly(pt.token, groupId, true);
    await api.managersOnly(pt.token, groupId, true);
    await api.managersOnly(pt.token, groupId, false);
    const lines = (await systemLines(w, groupId)).filter(
      (l) => l.event.type === "managers_only",
    );

    expect(lines.map((l) => l.event.enabled)).toEqual([true, false]);
  });

  it("stores a valid photo behind a signed URL and refuses an invalid one", async () => {
    const groupId = await ptGroup();
    const bad = await api.setAvatar(
      pt.token,
      groupId,
      `data:image/png;base64,${Buffer.from("<svg/>").toString("base64")}`,
    );

    expect(bad.status).toBe(400);
    const set = await api.setAvatar(pt.token, groupId, avatarUrl);

    expect(set.status).toBe(200);
    expect(set.body.avatarUrl).toMatch(
      new RegExp(`^/v1/chat/groups/${groupId}/avatar\\?v=\\d+&t=[\\w-]+$`),
    );
    const list = await api.list(ann.token);

    expect(
      list.body.groups.find((g: { id: number }) => g.id === groupId)?.avatarUrl,
    ).toBe(set.body.avatarUrl);
    const path = (set.body.avatarUrl as string).replace("/v1/chat/groups", "");
    const asMember = await api.call("get", path, ann.token);

    expect(asMember.status).toBe(200);
    expect(asMember.headers["content-type"]).toBe("image/png");
    // The signed URL is the capability; without it a non-member gets 404.
    expect((await api.call("get", path, cat.token)).status).toBe(200);
    expect(
      (await api.call("get", `/${groupId}/avatar`, cat.token)).status,
    ).toBe(404);
    expect(
      (await api.call("get", `/${groupId}/avatar?v=1&t=forged`, cat.token))
        .status,
    ).toBe(404);
    expect(
      (await systemLines(w, groupId)).filter(
        (l) => l.event.type === "avatar_changed",
      ),
    ).toHaveLength(1);
    const cleared = await api.clearAvatar(pt.token, groupId);

    expect(cleared.body.avatarUrl).toBeNull();
    expect((await api.call("get", path, ann.token)).status).toBe(404);
  });

  it("mutes and unmutes a member's own row without touching anyone else", async () => {
    const groupId = await ptGroup();

    expect((await api.mute(ann.token, groupId, true)).status).toBe(204);
    expect((await memberRow(w, groupId, ann.key))?.muted_at).not.toBeNull();
    expect((await memberRow(w, groupId, ben.key))?.muted_at).toBeNull();
    expect(
      (await api.list(ann.token)).body.groups.find(
        (g: { id: number }) => g.id === groupId,
      )?.muted,
    ).toBe(true);
    await api.mute(ann.token, groupId, false);
    expect((await memberRow(w, groupId, ann.key))?.muted_at).toBeNull();
    expect((await api.mute(cat.token, groupId, true)).status).toBe(404);
  });
});

describe("read cursor", () => {
  it("moves forward only, never past the newest message, never to another group's id", async () => {
    const groupId = await ptGroup();
    const other = await ptGroup();
    const first = await api.sendId(pt.token, groupId, { body: "1" });
    const foreign = await api.sendId(pt.token, other, { body: "x" });
    const second = await api.sendId(pt.token, groupId, { body: "2" });

    expect(foreign).toBeGreaterThan(first);
    expect((await api.read(ann.token, groupId, first)).body).toEqual({
      lastReadMessageId: first,
    });
    // An id of another group between the two is stored as this group's
    // newest message at or below it.
    expect((await api.read(ann.token, groupId, foreign)).body).toEqual({
      lastReadMessageId: first,
    });
    expect((await api.read(ann.token, groupId, 0)).body).toEqual({
      lastReadMessageId: first,
    });
    expect(
      (await api.read(ann.token, groupId, second + 1_000_000)).body,
    ).toEqual({ lastReadMessageId: second });
    expect((await memberRow(w, groupId, ann.key))?.last_read_message_id).toBe(
      second,
    );
  });

  it("keeps NULL (nothing read) in a group without messages", async () => {
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });

    // The member_added line is the only row; marking 0 stores nothing.
    const empty = await api.createId(pt.token);

    expect((await api.read(pt.token, empty, 5)).body).toEqual({
      lastReadMessageId: 0,
    });
    expect(
      (await memberRow(w, empty, pt.key))?.last_read_message_id,
    ).toBeNull();
    expect((await api.read(ann.token, groupId, 0)).status).toBe(200);
  });

  it("creates a super admin's state row lazily and keeps the members unchanged", async () => {
    const groupId = await ptGroup();
    const mid = await api.sendId(pt.token, groupId);
    const before = (await api.info(superAdmin.token, groupId)).body.members;

    await api.read(superAdmin.token, groupId, mid);
    expect(await memberRow(w, groupId, superAdmin.key)).toMatchObject({
      last_read_message_id: mid,
      left_at: null,
    });
    expect((await api.info(superAdmin.token, groupId)).body.members).toEqual(
      before,
    );
  });

  it("stays allowed for a trainee whose chat is off", async () => {
    const off = await traineeIn(w, { ptAdminId: pt.id, chat: false });
    const groupId = await api.createId(pt.token, { userIds: [off.id] });
    const mid = await api.sendId(pt.token, groupId);

    expect((await api.read(off.token, groupId, mid)).status).toBe(200);
    expect((await api.thread(off.token, groupId)).body.viewer.sendBlock).toBe(
      "chat_off",
    );
  });
});

describe("sending (G4, G10, G13)", () => {
  it("stores the message, moves the inbox pointer and returns the view", async () => {
    const groupId = await ptGroup();
    const response = await api.send(ann.token, groupId, { body: "  hi all " });

    expect(response.status).toBe(201);
    expect(response.body.message).toMatchObject({
      groupId,
      kind: "message",
      senderKey: ann.key,
      senderName: "Ann",
      senderTag: null,
      body: "hi all",
      deleted: false,
      hidden: false,
      seenCount: 0,
    });
    const group = await w.ds.query(
      `SELECT last_message_id FROM chat_groups WHERE id = $1`,
      [groupId],
    );

    expect(group[0].last_message_id).toBe(response.body.message.id);
  });

  it("is idempotent per sender: a retry returns the stored message, another member's same key is theirs", async () => {
    const groupId = await ptGroup();
    const key = newKey();
    const first = await api.send(ann.token, groupId, { body: "once" }, key);
    const retry = await api.send(ann.token, groupId, { body: "twice" }, key);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.message.id).toBe(first.body.message.id);
    expect(retry.body.message.body).toBe("once");
    const other = await api.send(ben.token, groupId, { body: "mine" }, key);

    expect(other.status).toBe(201);
    expect(other.body.message.id).not.toBe(first.body.message.id);
    expect(other.body.message.senderKey).toBe(ben.key);
    const parallel = newKey();
    const both = await Promise.all([
      api.send(ann.token, groupId, { body: "race" }, parallel),
      api.send(ann.token, groupId, { body: "race" }, parallel),
    ]);

    expect(both.map((r) => r.body.message.id)[0]).toBe(both[1].body.message.id);
    expect(both.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(
      (
        await api.call("post", `/${groupId}/messages`, ann.token, {
          body: { body: "no key" },
        })
      ).status,
    ).toBe(400);
  });

  it("stores /imlang as silent", async () => {
    const groupId = await ptGroup();
    const response = await api.send(pt.token, groupId, {
      body: "/imlang shh",
    });

    expect(response.body.message).toMatchObject({ body: "shh", silent: true });
  });

  it("stores a bundled sticker without text", async () => {
    const groupId = await ptGroup();
    const response = await api.send(ann.token, groupId, {
      sticker: { pack: "fluent", id: "fire" },
    });

    expect(response.status).toBe(201);
    expect(response.body.message.body).toBe("");
    expect(response.body.message.sticker).toMatchObject({ kind: "pack" });
  });

  it("blocks a trainee under managers-only but not the PT or a super admin", async () => {
    const groupId = await ptGroup();

    await api.managersOnly(pt.token, groupId, true);
    const refused = await api.send(ann.token, groupId, { body: "hi" });

    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("GROUP_MANAGERS_ONLY");
    expect((await api.thread(ann.token, groupId)).body.viewer.sendBlock).toBe(
      "managers_only",
    );
    expect((await api.send(pt.token, groupId, { body: "ok" })).status).toBe(
      201,
    );
    expect(
      (await api.send(superAdmin.token, groupId, { body: "ok" })).status,
    ).toBe(201);
    // Reading stays open.
    expect((await api.thread(ann.token, groupId)).status).toBe(200);
  });

  it("blocks chat off and a restricted trainee, with nothing stored", async () => {
    const off = await traineeIn(w, { ptAdminId: pt.id, chat: false });
    const limited = await traineeIn(w, { ptAdminId: pt.id });

    await restrict(w, limited.id);
    const groupId = await api.createId(pt.token, {
      userIds: [off.id, limited.id],
    });
    const offSend = await api.send(off.token, groupId, { body: "hi" });
    const restricted = await api.send(limited.token, groupId, { body: "hi" });

    expect(offSend.status).toBe(403);
    expect(offSend.body.code).toBe("CHAT_LOCKED");
    expect(restricted.status).toBe(403);
    expect(restricted.body.code).toBe("RESTRICTED");
    expect(
      (await api.upload(limited.token, groupId, pngBytes())).body.code,
    ).toBe("RESTRICTED");
    const stored = await w.ds.query(
      `SELECT count(*)::int AS n FROM chat_group_messages WHERE group_id = $1 AND kind = 'message'`,
      [groupId],
    );

    expect(stored[0].n).toBe(0);
    // A restricted trainee still reads and marks read.
    expect(
      (await api.thread(limited.token, groupId)).body.viewer.sendBlock,
    ).toBe("restricted");
    expect((await api.read(limited.token, groupId, 0)).status).toBe(200);
  });

  it("replies only to a message of the same group", async () => {
    const groupId = await ptGroup();
    const other = await ptGroup();
    const target = await api.sendId(pt.token, groupId, { body: "question" });
    const foreign = await api.sendId(pt.token, other, { body: "elsewhere" });
    const reply = await api.send(ann.token, groupId, {
      body: "answer",
      replyToMessageId: target,
    });

    expect(reply.status).toBe(201);
    expect(reply.body.message.replyTo).toMatchObject({
      id: target,
      senderKey: pt.key,
      snippet: "question",
      unavailable: false,
    });
    expect(
      (
        await api.send(ann.token, groupId, {
          body: "x",
          replyToMessageId: foreign,
        })
      ).status,
    ).toBe(400);
    const line = (await systemLines(w, groupId))[0].id;

    expect(
      (
        await api.send(ann.token, groupId, {
          body: "x",
          replyToMessageId: line,
        })
      ).status,
    ).toBe(400);
  });

  it("attaches the sender's own pending photos once, in order, to this group only", async () => {
    const groupId = await ptGroup();
    const other = await ptGroup();
    const upload = async (person: Person, gid: number, w2 = 2) =>
      (await api.upload(person.token, gid, pngBytes(w2, 2))).body.photo
        .id as number;
    const a = await upload(ann, groupId, 3);
    const b = await upload(ann, groupId, 4);
    const sent = await api.send(ann.token, groupId, {
      body: "look",
      photoIds: [b, a],
    });

    expect(sent.status).toBe(201);
    expect(
      sent.body.message.photos.map((p: { id: number; width: number }) => [
        p.id,
        p.width,
      ]),
    ).toEqual([
      [b, 4],
      [a, 3],
    ]);
    expect(sent.body.message.photo.id).toBe(b);
    expect(sent.body.message.photos[0].url).toBe(
      `/v1/chat/groups/${groupId}/photos/${b}`,
    );
    // Already attached, another member's, another group's: refused.
    const bens = await upload(ben, groupId);
    const foreign = await upload(ann, other);

    for (const photoIds of [[a], [bens], [foreign]]) {
      expect((await api.send(ann.token, groupId, { photoIds })).status).toBe(
        400,
      );
    }
    // Members get the bytes through this group's URL only, never a pending one.
    const bytes = await api.photo(ben.token, groupId, b);

    expect(bytes.status).toBe(200);
    expect(bytes.headers["content-type"]).toBe("image/png");
    expect((await api.photo(cat.token, groupId, b)).status).toBe(404);
    expect((await api.photo(ann.token, other, b)).status).toBe(404);
    expect((await api.photo(ann.token, groupId, bens)).status).toBe(404);
  });

  it("applies the send rules to uploads and checks the bytes", async () => {
    const groupId = await ptGroup();

    await api.managersOnly(pt.token, groupId, true);
    expect((await api.upload(ann.token, groupId, pngBytes())).status).toBe(403);
    expect((await api.upload(pt.token, groupId, pngBytes())).status).toBe(201);
    expect(
      (await api.upload(pt.token, groupId, Buffer.from("GIF89a000000"))).status,
    ).toBe(400);
    expect((await api.upload(cat.token, groupId, pngBytes())).status).toBe(404);
  });

  it("answers not found for a dissolved group, even to a member", async () => {
    const groupId = await ptGroup();

    await api.dissolve(superAdmin.token, groupId);
    expect((await api.send(ann.token, groupId, { body: "hi" })).status).toBe(
      404,
    );
    expect((await api.send(pt.token, groupId, { body: "hi" })).status).toBe(
      404,
    );
    expect(
      (await api.send(superAdmin.token, groupId, { body: "hi" })).status,
    ).toBe(404);
  });

  it("rejects bad input without storing anything", async () => {
    const groupId = await ptGroup();

    for (const body of [
      {},
      { body: "" },
      { body: "x".repeat(2001) },
      { body: "/imlang" },
      { sticker: { pack: "fluent", id: "nope" } },
      { sticker: { pack: "fluent", id: "fire" }, body: "and text" },
    ]) {
      expect((await api.send(ann.token, groupId, body)).status).toBe(400);
    }
  });
});

describe("message changes (company group-mutations)", () => {
  it("adds, replaces and removes one reaction per reactor, counting the viewer's own", async () => {
    const groupId = await ptGroup();
    const mid = await api.sendId(pt.token, groupId);

    await api.react(ann.token, groupId, mid, "❤️");
    await api.react(ben.token, groupId, mid, "❤️");
    const replaced = await api.react(ann.token, groupId, mid, "😂");

    expect(replaced.body.message.reactions).toEqual([
      { emoji: "❤️", count: 1, mine: false },
      { emoji: "😂", count: 1, mine: true },
    ]);
    const asBen = await api.react(ben.token, groupId, mid, "😂");

    expect(asBen.body.message.reactions).toEqual([
      { emoji: "😂", count: 2, mine: true },
    ]);
    const removed = await api.unreact(ann.token, groupId, mid);

    expect(removed.body.message.reactions).toEqual([
      { emoji: "😂", count: 1, mine: false },
    ]);
    expect((await api.react(ann.token, groupId, mid, "🍕")).status).toBe(400);
  });

  it("stamps the change cursor so pollers see edits, reactions and hides", async () => {
    const groupId = await ptGroup();
    const mid = await api.sendId(ann.token, groupId);
    const before = (await api.thread(ben.token, groupId)).body.lastChangeAt;

    await api.react(ben.token, groupId, mid, "👍");
    const after = await api.thread(
      ben.token,
      groupId,
      `?changedSince=${before}`,
    );

    expect(after.body.lastChangeAt).toBeGreaterThan(before);
    expect(after.body.changes.map((m: { id: number }) => m.id)).toEqual([mid]);
    expect(
      (
        await api.thread(
          ben.token,
          groupId,
          `?changedSince=${after.body.lastChangeAt}`,
        )
      ).body.changes,
    ).toEqual([]);
  });

  it("refuses an unsent message, a system line and a foreign message", async () => {
    const groupId = await ptGroup();
    const other = await ptGroup();
    const mid = await api.sendId(ann.token, groupId);
    const foreign = await api.sendId(ann.token, other);
    const line = (await systemLines(w, groupId))[0].id;

    await api.unsend(ann.token, groupId, mid);
    expect((await api.react(ben.token, groupId, mid, "👍")).status).toBe(409);
    expect((await api.react(ben.token, groupId, line, "👍")).status).toBe(404);
    expect((await api.react(ben.token, groupId, foreign, "👍")).status).toBe(
      404,
    );
  });

  it("allows reactions and edits under managers-only but not for a restricted trainee", async () => {
    const limited = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, {
      userIds: [ann.id, limited.id],
    });
    const mine = await api.sendId(ann.token, groupId, { body: "draft" });
    const limitedMine = await api.sendId(limited.token, groupId);

    await api.managersOnly(pt.token, groupId, true);
    expect((await api.react(ann.token, groupId, mine, "👍")).status).toBe(200);
    expect((await api.edit(ann.token, groupId, mine, "final")).status).toBe(
      200,
    );
    await restrict(w, limited.id);
    expect(
      (await api.react(limited.token, groupId, mine, "👍")).body.code,
    ).toBe("RESTRICTED");
    expect(
      (await api.edit(limited.token, groupId, limitedMine, "x")).body.code,
    ).toBe("RESTRICTED");
    // A restricted trainee may still take their message back.
    const unsent = await api.unsend(limited.token, groupId, limitedMine);

    expect(unsent.status).toBe(200);
    expect(unsent.body.message.deleted).toBe(true);
  });

  it("edits with history for the author only; the same text is no edit", async () => {
    const groupId = await ptGroup();
    const mid = await api.sendId(ann.token, groupId, { body: "v1" });

    expect((await api.edit(pt.token, groupId, mid, "pt edit")).status).toBe(
      403,
    );
    expect(
      (await api.edit(superAdmin.token, groupId, mid, "x")).body.code,
    ).toBe("NOT_YOUR_MESSAGE");
    const edited = await api.edit(ann.token, groupId, mid, "v2");

    expect(edited.body.message).toMatchObject({ body: "v2", edited: true });
    await api.edit(ann.token, groupId, mid, "v2");
    const history = await api.edits(ben.token, groupId, mid);

    expect(history.status).toBe(200);
    expect(
      history.body.edits.map((e: { previousBody: string }) => e.previousBody),
    ).toEqual(["v1"]);
    expect((await api.edits(cat.token, groupId, mid)).status).toBe(404);
    const sticker = await api.send(ann.token, groupId, {
      sticker: { pack: "fluent", id: "fire" },
    });

    expect(
      (await api.edit(ann.token, groupId, sticker.body.message.id, "x")).status,
    ).toBe(409);
  });

  it("unsends as a flag only: the row keeps text and photos, readers get nothing, idempotent", async () => {
    const groupId = await ptGroup();
    const photo = (await api.upload(ann.token, groupId, pngBytes())).body.photo
      .id as number;
    const mid = (
      await api.send(ann.token, groupId, { body: "secret", photoIds: [photo] })
    ).body.message.id as number;

    await api.edit(ann.token, groupId, mid, "secret 2");
    expect((await api.unsend(ben.token, groupId, mid)).status).toBe(403);
    const unsent = await api.unsend(ann.token, groupId, mid);

    expect(unsent.body.message).toMatchObject({
      body: "",
      photo: null,
      photos: [],
      deleted: true,
      edited: false,
      reactions: [],
    });
    expect((await api.unsend(ann.token, groupId, mid)).status).toBe(200);
    const row = await w.ds.query(
      `SELECT body, deleted_at FROM chat_group_messages WHERE id = $1`,
      [mid],
    );

    expect(row[0].body).toBe("secret 2");
    expect(row[0].deleted_at).not.toBeNull();
    const photos = await w.ds.query(
      `SELECT count(*)::int AS n FROM chat_group_photos WHERE message_id = $1`,
      [mid],
    );

    expect(photos[0].n).toBe(1);
    expect((await api.photo(ben.token, groupId, photo)).status).toBe(404);
    expect((await api.edits(ben.token, groupId, mid)).body.edits).toEqual([]);
  });

  it("hides for a super admin and the creator PT only, with a placeholder, and unhides", async () => {
    const groupId = await api.createId(pt.token, {
      userIds: [ann.id, ben.id],
    });

    await api.add(superAdmin.token, groupId, { ptIds: [otherPt.id] });
    const photo = (await api.upload(ann.token, groupId, pngBytes())).body.photo
      .id as number;
    const mid = (
      await api.send(ann.token, groupId, { body: "rude", photoIds: [photo] })
    ).body.message.id as number;

    expect((await api.hide(otherPt.token, groupId, mid, true)).status).toBe(
      403,
    );
    expect((await api.hide(ann.token, groupId, mid, true)).status).toBe(403);
    const hidden = await api.hide(pt.token, groupId, mid, true);

    expect(hidden.status).toBe(200);
    const asBen = (await api.thread(ben.token, groupId)).body.messages.find(
      (m: { id: number }) => m.id === mid,
    );

    expect(asBen).toMatchObject({
      hidden: true,
      body: "",
      photos: [],
      sticker: null,
    });
    const row = await w.ds.query(
      `SELECT body, hidden_by_key FROM chat_group_messages WHERE id = $1`,
      [mid],
    );

    expect(row[0]).toEqual({ body: "rude", hidden_by_key: pt.key });
    // The photo stays for the managers who moderate, not for members.
    expect((await api.photo(ben.token, groupId, photo)).status).toBe(404);
    expect((await api.photo(pt.token, groupId, photo)).status).toBe(200);
    const cursor = (await api.thread(ben.token, groupId)).body.lastChangeAt;

    await api.hide(superAdmin.token, groupId, mid, true);
    expect((await api.thread(ben.token, groupId)).body.lastChangeAt).toBe(
      cursor,
    );
    const shown = await api.hide(superAdmin.token, groupId, mid, false);

    expect(shown.body.message).toMatchObject({ hidden: false, body: "rude" });
    const line = (await systemLines(w, groupId))[0].id;

    expect((await api.hide(pt.token, groupId, line, true)).status).toBe(404);
  });
});

describe("thread, names and seen-by (company group-queries)", () => {
  it("pages with before and after, oldest first, and reports hasMore", async () => {
    const groupId = await ptGroup();
    const ids: number[] = [];

    for (let i = 0; i < 32; i += 1) {
      ids.push(await api.sendId(pt.token, groupId, { body: `m${i}` }));
    }
    const newest = await api.thread(ann.token, groupId);

    expect(newest.body.hasMore).toBe(true);
    expect(newest.body.messages).toHaveLength(30);
    expect(newest.body.messages.at(-1).id).toBe(ids[31]);
    const older = await api.thread(
      ann.token,
      groupId,
      `?before=${newest.body.messages[0].id}`,
    );

    expect(older.body.hasMore).toBe(false);
    // 2 messages + the member_added line.
    expect(older.body.messages).toHaveLength(3);
    const after = await api.thread(ann.token, groupId, `?after=${ids[29]}`);

    expect(after.body.messages.map((m: { id: number }) => m.id)).toEqual([
      ids[30],
      ids[31],
    ]);
    expect(
      (await api.thread(ann.token, groupId, `?after=1&before=2`)).status,
    ).toBe(400);
  });

  it("names senders with the viewer's nickname first, tags managers and PTs, and marks deleted accounts", async () => {
    const gone = await traineeIn(w, { ptAdminId: pt.id, name: "Gone" });
    const groupId = await api.createId(superAdmin.token, {
      userIds: [ann.id, gone.id],
      ptIds: [pt.id],
    });

    await api.sendId(superAdmin.token, groupId, { body: "from manager" });
    await api.sendId(pt.token, groupId, { body: "from pt" });
    await api.sendId(gone.token, groupId, { body: "from gone" });
    await w.ds.query(
      `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at)
       VALUES ($1, $2, 'Coach', now())`,
      [ann.key, pt.key],
    );
    await w.ds.query(`DELETE FROM users WHERE id = $1`, [gone.id]);
    const messages = (await api.thread(ann.token, groupId)).body.messages as {
      body: string;
      senderName: string | null;
      senderTag: string | null;
      senderDeleted: boolean;
      kind: string;
      eventNames: Record<string, string | null>;
    }[];
    const by = (body: string) => messages.find((m) => m.body === body)!;

    expect(by("from manager")).toMatchObject({ senderTag: "manager" });
    expect(by("from pt")).toMatchObject({
      senderName: "Coach",
      senderTag: "pt",
    });
    expect(by("from gone")).toMatchObject({
      senderName: null,
      senderDeleted: true,
    });
    const line = messages.find((m) => m.kind === "system")!;

    expect(line.eventNames[pt.key]).toBe("Coach");
    expect(line.eventNames[gone.key]).toBeNull();
  });

  it("quotes the reply target and blanks it once unsent", async () => {
    const groupId = await ptGroup();
    const target = await api.sendId(ann.token, groupId, { body: "original" });
    const reply = await api.sendId(ben.token, groupId, {
      body: "re",
      replyToMessageId: target,
    });

    await api.unsend(ann.token, groupId, target);
    const view = (await api.thread(pt.token, groupId)).body.messages.find(
      (m: { id: number }) => m.id === reply,
    );

    expect(view.replyTo).toMatchObject({
      id: target,
      snippet: "",
      unavailable: true,
    });
  });

  it("counts Seen by on own messages and lists who, never the sender or a left member", async () => {
    const groupId = await ptGroup();
    const mid = await api.sendId(ann.token, groupId);

    await api.read(ben.token, groupId, mid);
    await api.read(pt.token, groupId, mid);
    await api.read(superAdmin.token, groupId, mid);
    await api.read(ann.token, groupId, mid);
    const own = (await api.thread(ann.token, groupId)).body.messages.find(
      (m: { id: number }) => m.id === mid,
    );
    const others = (await api.thread(ben.token, groupId)).body.messages.find(
      (m: { id: number }) => m.id === mid,
    );

    expect(own.seenCount).toBe(3);
    expect(others.seenCount).toBe(0);
    await api.leave(ben.token, groupId);
    const seen = await api.seen(ann.token, groupId, mid);

    expect(seen.status).toBe(200);
    expect(seen.body.seenBy.map((s: { key: string }) => s.key).sort()).toEqual(
      [pt.key, superAdmin.key].sort(),
    );
    const line = (await systemLines(w, groupId))[0].id;

    expect((await api.seen(ann.token, groupId, line)).status).toBe(404);
    expect((await api.seen(cat.token, groupId, mid)).status).toBe(404);
  });

  it("lists explicit members plus every super admin, never a left member", async () => {
    const groupId = await ptGroup();

    await api.leave(ben.token, groupId);
    await api.mute(superAdmin.token, groupId, true);
    const members = (await api.info(ann.token, groupId)).body.members as {
      key: string;
      role: string;
    }[];
    const keys = members.map((m) => m.key);

    expect(keys).toContain(superAdmin.key);
    expect(keys).toContain(pt.key);
    expect(keys).toContain(ann.key);
    expect(keys).not.toContain(ben.key);
    expect(keys.filter((k) => k === superAdmin.key)).toHaveLength(1);
  });
});

describe("inbox and unread (company group-queries, group-routes)", () => {
  it("lists a trainee's own groups only, newest first, with unread, mute and the preview", async () => {
    const solo = await traineeIn(w, { ptAdminId: pt.id });
    const a = await api.createId(pt.token, { name: "A", userIds: [solo.id] });
    const b = await api.createId(pt.token, { name: "B", userIds: [solo.id] });
    const notMine = await api.createId(pt.token, { name: "C" });

    await api.sendId(pt.token, b, { body: "older" });
    await api.sendId(pt.token, a, { body: "newer text" });
    await api.mute(solo.token, b, true);
    const list = await api.list(solo.token);

    expect(list.status).toBe(200);
    expect(list.body.groups.map((g: { id: number }) => g.id)).toEqual([a, b]);
    expect(list.body.groups[0]).toMatchObject({
      name: "A",
      unread: 1,
      muted: false,
      canManage: false,
      lastMessage: { kind: "message", preview: "newer text", media: null },
    });
    expect(list.body.groups[1]).toMatchObject({ unread: 1, muted: true });
    expect(list.body.groups.map((g: { id: number }) => g.id)).not.toContain(
      notMine,
    );
    // Mute does not change unread.
    expect((await api.unread(solo.token)).body).toEqual({
      total: 2,
      perGroup: [
        { groupId: a, unread: 1 },
        { groupId: b, unread: 1 },
      ],
    });
  });

  it("excludes own, system, alert, hidden and unsent messages and follows the cursor", async () => {
    const solo = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [solo.id] });

    await api.sendId(solo.token, groupId, { body: "own" });
    const hidden = await api.sendId(pt.token, groupId, { body: "hidden" });
    const unsent = await api.sendId(pt.token, groupId, { body: "unsent" });
    const counted = await api.sendId(pt.token, groupId, { body: "counted" });

    await api.hide(pt.token, groupId, hidden, true);
    await api.unsend(pt.token, groupId, unsent);
    await api.rename(pt.token, groupId, "Renamed");
    expect((await api.unread(solo.token)).body.total).toBe(1);
    await api.read(solo.token, groupId, counted);
    expect((await api.unread(solo.token)).body).toEqual({
      total: 0,
      perGroup: [],
    });
  });

  it("counts for a super admin only messages after the account existed", async () => {
    const groupId = await ptGroup();

    await api.sendId(pt.token, groupId, { body: "before" });
    const later = await adminIn(w, "super_admin");
    const count = (await api.unread(later.token)).body.perGroup.find(
      (row: { groupId: number }) => row.groupId === groupId,
    );

    expect(count).toBeUndefined();
    await api.sendId(pt.token, groupId, { body: "after" });
    expect(
      (await api.unread(later.token)).body.perGroup.find(
        (row: { groupId: number }) => row.groupId === groupId,
      ),
    ).toEqual({ groupId, unread: 1 });
  });

  it("shows a super admin every group that is not dissolved, with manage rights", async () => {
    const groupId = await ptGroup();
    const gone = await ptGroup();

    await api.dissolve(superAdmin.token, gone);
    const groups = (await api.list(superAdmin.token)).body.groups as {
      id: number;
      canManage: boolean;
    }[];

    expect(groups.find((g) => g.id === groupId)?.canManage).toBe(true);
    expect(groups.some((g) => g.id === gone)).toBe(false);
  });

  it("gives no text for an unsent or hidden last message and labels photos and stickers", async () => {
    const groupId = await ptGroup();
    const last = () =>
      api
        .list(ann.token)
        .then(
          (r) =>
            r.body.groups.find((g: { id: number }) => g.id === groupId)
              .lastMessage,
        );
    const mid = await api.sendId(pt.token, groupId, { body: "secret" });

    await api.unsend(pt.token, groupId, mid);
    expect(await last()).toMatchObject({ preview: "", media: null });
    const p1 = (await api.upload(pt.token, groupId, pngBytes())).body.photo.id;
    const p2 = (await api.upload(pt.token, groupId, pngBytes())).body.photo.id;

    await api.send(pt.token, groupId, { photoIds: [p1, p2] });
    expect(await last()).toMatchObject({ media: "photo", photoCount: 2 });
    await api.send(pt.token, groupId, {
      sticker: { pack: "fluent", id: "fire" },
    });
    expect(await last()).toMatchObject({ media: "sticker", photoCount: 0 });
    const hidden = await api.sendId(pt.token, groupId, { body: "rude" });

    await api.hide(pt.token, groupId, hidden, true);
    expect(await last()).toMatchObject({ preview: "", media: null });
  });
});

describe("dissolve (G6)", () => {
  it("dissolves softly for a super admin only, keeps the data and lets a super admin read it", async () => {
    const groupId = await ptGroup();
    const mid = await api.sendId(ann.token, groupId);

    expect((await api.dissolve(pt.token, groupId)).status).toBe(403);
    expect((await api.dissolve(superAdmin.token, groupId)).status).toBe(204);
    expect((await api.dissolve(superAdmin.token, groupId)).status).toBe(204);
    expect((await api.dissolve(superAdmin.token, 999_999)).status).toBe(404);
    const row = await w.ds.query(
      `SELECT dissolved_at, dissolved_by_admin_id FROM chat_groups WHERE id = $1`,
      [groupId],
    );

    expect(row[0].dissolved_by_admin_id).toBe(superAdmin.id);
    for (const person of [ann, pt]) {
      expect((await api.thread(person.token, groupId)).status).toBe(404);
    }
    const asSuper = await api.thread(superAdmin.token, groupId);

    expect(asSuper.status).toBe(200);
    expect(asSuper.body.group.dissolved).toBe(true);
    expect(asSuper.body.viewer).toMatchObject({
      canManage: false,
      sendBlock: "dissolved",
    });
    expect(
      asSuper.body.messages.some((m: { id: number }) => m.id === mid),
    ).toBe(true);
    expect((await api.rename(superAdmin.token, groupId, "x")).status).toBe(404);
    expect(
      (await api.add(superAdmin.token, groupId, { userIds: [cat.id] })).status,
    ).toBe(404);
  });
});
