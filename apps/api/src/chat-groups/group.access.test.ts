import { describe, expect, it } from "vitest";

import type { AuthActor } from "../auth/actor.js";
import { GroupAccess } from "./group.access.js";
import type { GroupQueries, GroupRow, MemberRow } from "./group.queries.js";

// Company group-access.test.ts: the one door to a group, the send block with
// the restriction hook (the session's restriction) and the management check.

const groupRow = (over: Partial<GroupRow> = {}): GroupRow => ({
  id: 3,
  name: "G",
  avatarUpdatedAt: null,
  createdByKey: "admin:2",
  managersOnly: false,
  lastMessageId: null,
  lastMessageAt: null,
  lastChangeAt: null,
  dissolvedAt: null,
  createdAt: new Date(),
  ...over,
});

const member = (over: Partial<MemberRow> = {}): MemberRow => ({
  memberKey: "user:9",
  leftAt: null,
  mutedAt: null,
  lastReadMessageId: null,
  ...over,
});

const accessWith = (group: GroupRow | null, row: MemberRow | null) =>
  new GroupAccess({
    findGroup: () => Promise.resolve(group),
    findMember: () => Promise.resolve(row),
  } as unknown as GroupQueries);

const trainee = (over: Partial<Extract<AuthActor, { kind: "user" }>> = {}) =>
  ({
    kind: "user",
    id: 9,
    chatEnabled: true,
    restriction: null,
    ...over,
  }) as AuthActor;

const admin = (role: "super_admin" | "pt", id: number) =>
  ({ kind: "admin", id, role, locked: false }) as AuthActor;

const restriction = {
  id: 1,
  userId: 9,
  level: "restricted" as const,
  until: null,
  reason: "spam",
  createdAt: new Date(),
};

describe("GroupAccess", () => {
  it("answers not found for a missing group, a non-member and a left member", async () => {
    await expect(
      accessWith(null, null).load(trainee(), 3),
    ).rejects.toMatchObject({ response: { code: "GROUP_NOT_FOUND" } });
    await expect(
      accessWith(groupRow(), null).load(trainee(), 3),
    ).rejects.toMatchObject({ response: { code: "GROUP_NOT_FOUND" } });
    await expect(
      accessWith(groupRow(), member({ leftAt: new Date() })).load(trainee(), 3),
    ).rejects.toMatchObject({ response: { code: "GROUP_NOT_FOUND" } });
  });

  it("lets a super admin into a dissolved group for reading only", async () => {
    const access = accessWith(groupRow({ dissolvedAt: new Date() }), null);
    const context = await access.load(admin("super_admin", 1), 3);

    expect(context.actor.isSuperAdmin).toBe(true);
    await expect(
      access.forChange(admin("super_admin", 1), 3),
    ).rejects.toMatchObject({ response: { code: "GROUP_NOT_FOUND" } });
    expect(access.sendBlock(context)).toBe("dissolved");
  });

  it("refuses management to a PT member who is not the creator", async () => {
    const access = accessWith(groupRow(), member({ memberKey: "admin:7" }));

    await expect(
      access.forChange(admin("pt", 7), 3, { manage: true }),
    ).rejects.toMatchObject({ response: { code: "GROUP_NOT_MANAGER" } });
    await expect(
      accessWith(groupRow(), member({ memberKey: "admin:2" })).forChange(
        admin("pt", 2),
        3,
        { manage: true },
      ),
    ).resolves.toMatchObject({ actor: { canManage: true } });
  });

  it("blocks a restricted trainee from writing, except to take a message back", async () => {
    const access = accessWith(groupRow(), member());
    const context = await access.load(trainee({ restriction }), 3);

    expect(access.sendBlock(context)).toBe("restricted");
    expect(access.sendBlock(context, { allowRestricted: true })).toBeNull();
    expect(() => access.requireWrite(context)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: "RESTRICTED" }),
      }),
    );
  });

  it("blocks chat off even for an unsend, and managers-only except reactions and edits", async () => {
    const off = await accessWith(groupRow(), member()).load(
      trainee({ chatEnabled: false }),
      3,
    );
    const access = accessWith(groupRow({ managersOnly: true }), member());
    const on = await access.load(trainee(), 3);

    expect(
      accessWith(groupRow(), member()).sendBlock(off, {
        allowRestricted: true,
        ignoreManagersOnly: true,
      }),
    ).toBe("chat_off");
    expect(access.sendBlock(on)).toBe("managers_only");
    expect(access.sendBlock(on, { ignoreManagersOnly: true })).toBeNull();
  });
});
