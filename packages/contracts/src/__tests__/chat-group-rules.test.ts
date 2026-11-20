import {
  buildGroupActor,
  countGroupUnreadFor,
  GROUP_MEMBER_CAP,
  type GroupActor,
  groupAddMembersRequestSchema,
  groupAddScopeOutcome,
  groupCanFitMembers,
  groupCreateRequestSchema,
  groupMemberCapRoom,
  groupMemberKeyParamSchema,
  groupNameSchema,
  groupPushTag,
  groupSeenByKeys,
  groupSendBlockReason,
  groupSenderTagOf,
  groupSendMessageRequestSchema,
  type GroupSession,
  type GroupSystemEvent,
  groupSystemEventKeys,
  type GroupUnreadCandidate,
  isGroupUnreadFor,
  parseGroupSystemEvent,
  serializeGroupSystemEvent,
  toGroupSystemLine,
} from "../index.js";
import { describe, expect, it } from "vitest";

// Company features/chat-groups/utils/__tests__/group-rules, system-event and
// group-unread, on the rules moved to contracts.

const group = { createdByKey: "admin:2", dissolvedAt: null as Date | null };
const active = { leftAt: null };
const superAdmin: GroupSession = { kind: "admin", id: 1, role: "super_admin" };
const creatorPt: GroupSession = { kind: "admin", id: 2, role: "pt" };
const otherPt: GroupSession = { kind: "admin", id: 3, role: "pt" };
const trainee: GroupSession = { kind: "user", id: 9 };

const actorOf = (
  session: GroupSession,
  member: { leftAt: Date | null } | null,
) => buildGroupActor({ session, group, member })!;

describe("buildGroupActor", () => {
  it("makes a super admin an implicit member with no member row", () => {
    expect(actorOf(superAdmin, null)).toMatchObject({
      key: "admin:1",
      role: "super_admin",
      isMember: true,
      canManage: true,
      isManager: true,
      isSuperAdmin: true,
    });
  });

  it("keeps a super admin in a dissolved group (read-only access)", () => {
    expect(
      buildGroupActor({
        session: superAdmin,
        group: { ...group, dissolvedAt: new Date() },
        member: null,
      }),
    ).not.toBeNull();
  });

  it("gives the creator PT manage rights and a PT member only manager status", () => {
    expect(actorOf(creatorPt, active)).toMatchObject({
      role: "pt",
      canManage: true,
      isManager: true,
    });
    expect(actorOf(otherPt, active)).toMatchObject({
      canManage: false,
      isManager: true,
    });
  });

  it("makes a trainee a plain member", () => {
    expect(actorOf(trainee, active)).toMatchObject({
      key: "user:9",
      role: "trainee",
      canManage: false,
      isManager: false,
      isSuperAdmin: false,
    });
  });

  it("answers nothing for a non-member, a left member and a dissolved group", () => {
    expect(
      buildGroupActor({ session: trainee, group, member: null }),
    ).toBeNull();
    expect(
      buildGroupActor({
        session: trainee,
        group,
        member: { leftAt: new Date() },
      }),
    ).toBeNull();
    expect(
      buildGroupActor({
        session: creatorPt,
        group: { ...group, dissolvedAt: new Date() },
        member: active,
      }),
    ).toBeNull();
  });

  it("lets only super admins manage once the creator PT account is gone", () => {
    const orphaned = { ...group, createdByKey: "admin:404" };

    expect(
      buildGroupActor({ session: creatorPt, group: orphaned, member: active })
        ?.canManage,
    ).toBe(false);
    expect(
      buildGroupActor({ session: superAdmin, group: orphaned, member: null })
        ?.canManage,
    ).toBe(true);
  });
});

describe("groupSendBlockReason", () => {
  const base = (actor: GroupActor) => ({
    actor,
    dissolved: false,
    managersOnly: false,
    chatEnabled: true,
    restricted: false,
  });

  it("lets everyone send by default", () => {
    expect(groupSendBlockReason(base(actorOf(trainee, active)))).toBeNull();
  });

  it("blocks a trainee under managers-only but not a PT or super admin", () => {
    const on = { managersOnly: true };

    expect(
      groupSendBlockReason({ ...base(actorOf(trainee, active)), ...on }),
    ).toBe("managers_only");
    expect(
      groupSendBlockReason({ ...base(actorOf(otherPt, active)), ...on }),
    ).toBeNull();
    expect(
      groupSendBlockReason({ ...base(actorOf(superAdmin, null)), ...on }),
    ).toBeNull();
  });

  it("can ignore managers-only for reactions and edits", () => {
    expect(
      groupSendBlockReason({
        ...base(actorOf(trainee, active)),
        managersOnly: true,
        ignoreManagersOnly: true,
      }),
    ).toBeNull();
  });

  it("blocks a trainee whose chat is off or who is restricted", () => {
    const actor = actorOf(trainee, active);

    expect(groupSendBlockReason({ ...base(actor), chatEnabled: false })).toBe(
      "chat_off",
    );
    expect(groupSendBlockReason({ ...base(actor), restricted: true })).toBe(
      "restricted",
    );
  });

  it("does not apply the trainee chat switch or restriction to admins", () => {
    expect(
      groupSendBlockReason({
        ...base(actorOf(creatorPt, active)),
        chatEnabled: false,
        restricted: true,
      }),
    ).toBeNull();
  });

  it("blocks a dissolved group for everyone and a non-member", () => {
    expect(
      groupSendBlockReason({
        ...base(actorOf(superAdmin, null)),
        dissolved: true,
      }),
    ).toBe("dissolved");
    expect(
      groupSendBlockReason({
        ...base({ ...actorOf(trainee, active), isMember: false }),
      }),
    ).toBe("left");
  });
});

describe("groupAddScopeOutcome", () => {
  it("lets a super admin add any trainee and any PT", () => {
    const actor = actorOf(superAdmin, null);

    expect(groupAddScopeOutcome(actor, { kind: "user" })).toBeNull();
    expect(
      groupAddScopeOutcome(actor, { kind: "admin", isPt: true }),
    ).toBeNull();
  });

  it("lets a PT add only accessible (own, not hidden) trainees", () => {
    const actor = actorOf(creatorPt, active);

    expect(
      groupAddScopeOutcome(actor, { kind: "user", accessible: true }),
    ).toBeNull();
    expect(
      groupAddScopeOutcome(actor, { kind: "user", accessible: false }),
    ).toBe("out_of_scope");
    expect(groupAddScopeOutcome(actor, { kind: "user" })).toBe("out_of_scope");
  });

  it("never lets a PT add another PT, and refuses a super admin target", () => {
    expect(
      groupAddScopeOutcome(actorOf(creatorPt, active), {
        kind: "admin",
        isPt: true,
      }),
    ).toBe("out_of_scope");
    expect(
      groupAddScopeOutcome(actorOf(superAdmin, null), {
        kind: "admin",
        isPt: false,
      }),
    ).toBe("not_trainee");
  });

  it("never lets a trainee add anyone", () => {
    expect(
      groupAddScopeOutcome(actorOf(trainee, active), {
        kind: "user",
        accessible: true,
      }),
    ).toBe("out_of_scope");
  });
});

describe("member cap", () => {
  it("allows 49 to 50 and refuses 50 to 51", () => {
    expect(GROUP_MEMBER_CAP).toBe(50);
    expect(groupCanFitMembers(49, 1)).toBe(true);
    expect(groupCanFitMembers(50, 1)).toBe(false);
    expect(groupCanFitMembers(0, 50)).toBe(true);
    expect(groupCanFitMembers(0, 51)).toBe(false);
  });

  it("reports the room left and never a negative one", () => {
    expect(groupMemberCapRoom(10)).toBe(40);
    expect(groupMemberCapRoom(70)).toBe(0);
    expect(groupMemberCapRoom(-3)).toBe(50);
  });
});

describe("input schemas", () => {
  it("trims and collapses the name and counts characters", () => {
    expect(groupNameSchema.parse("  Lớp   sáng  ")).toBe("Lớp sáng");
    expect(groupNameSchema.safeParse("   ").success).toBe(false);
    expect(groupNameSchema.safeParse("a".repeat(60)).success).toBe(true);
    expect(groupNameSchema.safeParse("a".repeat(61)).success).toBe(false);
    expect(groupNameSchema.safeParse("😀".repeat(60)).success).toBe(true);
    expect(groupNameSchema.safeParse("bad\u0000name").success).toBe(false);
    expect(groupNameSchema.safeParse(42).success).toBe(false);
  });

  it("defaults the member lists, keeps odd ids for a per-id result and caps the list", () => {
    expect(groupCreateRequestSchema.parse({ name: "A" })).toEqual({
      name: "A",
      userIds: [],
      ptIds: [],
    });
    expect(
      groupAddMembersRequestSchema.parse({ userIds: [1, -2, "x"] }).userIds,
    ).toEqual([1, -2, "x"]);
    expect(
      groupAddMembersRequestSchema.safeParse({
        userIds: Array.from({ length: 101 }, (_, i) => i + 1),
      }).success,
    ).toBe(false);
  });

  it("accepts member keys shaped like the database CHECK only", () => {
    expect(groupMemberKeyParamSchema.safeParse("user:12").success).toBe(true);
    expect(groupMemberKeyParamSchema.safeParse("admin:999999999").success).toBe(
      true,
    );
    for (const bad of ["user:0", "user:1234567890", "pt", "user:-1", "x:1"]) {
      expect(groupMemberKeyParamSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("needs text, photos or exactly one sticker to send", () => {
    const sticker = { pack: "fluent", id: "fire" };

    expect(groupSendMessageRequestSchema.safeParse({}).success).toBe(false);
    expect(
      groupSendMessageRequestSchema.safeParse({ body: "hi" }).success,
    ).toBe(true);
    expect(
      groupSendMessageRequestSchema.safeParse({ photoIds: [3] }).success,
    ).toBe(true);
    expect(
      groupSendMessageRequestSchema.safeParse({ body: "hi", photoIds: [3] })
        .success,
    ).toBe(true);
    expect(groupSendMessageRequestSchema.safeParse({ sticker }).success).toBe(
      true,
    );
    expect(
      groupSendMessageRequestSchema.safeParse({ sticker, body: "hi" }).success,
    ).toBe(false);
    expect(
      groupSendMessageRequestSchema.safeParse({ body: "   " }).success,
    ).toBe(false);
    expect(
      groupSendMessageRequestSchema.safeParse({
        photoIds: Array.from({ length: 11 }, (_, i) => i + 1),
      }).success,
    ).toBe(false);
    expect(
      groupSendMessageRequestSchema.safeParse({ photoIds: [3, 3] }).success,
    ).toBe(false);
  });
});

describe("sender tags and push tag", () => {
  it("tags super admins as Manager and PTs as PT", () => {
    expect(groupSenderTagOf("super_admin")).toBe("manager");
    expect(groupSenderTagOf("pt")).toBe("pt");
    expect(groupSenderTagOf("trainee")).toBeNull();
    expect(groupSenderTagOf(undefined)).toBeNull();
  });

  it("gives one notification tag per group", () => {
    expect(groupPushTag(7)).toBe("chat-group-7");
  });
});

// --- system events -------------------------------------------------------

const events: GroupSystemEvent[] = [
  {
    type: "member_added",
    actorKey: "admin:1",
    memberKeys: ["user:2", "user:3"],
  },
  { type: "member_removed", actorKey: "admin:1", memberKey: "user:2" },
  { type: "member_left", memberKey: "user:2" },
  { type: "renamed", actorKey: "admin:1", from: "A", to: "B" },
  { type: "avatar_changed", actorKey: "admin:1" },
  { type: "managers_only", actorKey: "admin:1", enabled: true },
  {
    type: "pt_changed",
    userId: 4,
    fromPtId: 2,
    toPtId: null,
    resolution: { choice: "keep", byAdminId: 1, at: 1000 },
  },
];

const nameOf = (key: string) => `<${key}>`;

describe("system event JSON", () => {
  it.each(events)("round trips $type", (event) => {
    expect(parseGroupSystemEvent(serializeGroupSystemEvent(event))).toEqual(
      event,
    );
  });

  it("refuses to store an invalid event", () => {
    expect(() =>
      serializeGroupSystemEvent({
        type: "member_left",
        memberKey: "nobody",
      } as GroupSystemEvent),
    ).toThrow();
  });

  it.each([
    null,
    "",
    "not json",
    "[]",
    '{"type":"something_new"}',
    '{"type":"member_left"}',
    '{"type":"member_left","memberKey":"user:0"}',
  ])("reads %j as no event", (raw) => {
    expect(parseGroupSystemEvent(raw)).toBeNull();
  });
});

describe("toGroupSystemLine", () => {
  it("falls back to a neutral line for an unreadable row", () => {
    expect(toGroupSystemLine(null, nameOf)).toEqual({
      key: "systemLine.unknown",
      params: {},
    });
  });

  it("names the people of a member_added line", () => {
    expect(toGroupSystemLine(events[0], nameOf)).toEqual({
      key: "systemLine.member_added",
      params: { actor: "<admin:1>", members: "<user:2>, <user:3>", count: 2 },
    });
  });

  it("picks the managers-only key by the switch", () => {
    expect(toGroupSystemLine(events[5], nameOf).key).toBe(
      "systemLine.managers_only_on",
    );
    expect(
      toGroupSystemLine(
        { ...events[5], enabled: false } as GroupSystemEvent,
        nameOf,
      ).key,
    ).toBe("systemLine.managers_only_off");
  });

  it("shows the outcome and who chose on a resolved PT change", () => {
    expect(toGroupSystemLine(events[6], nameOf)).toEqual({
      key: "systemLine.pt_changed_keep",
      params: {
        member: "<user:4>",
        from: "<admin:2>",
        to: "",
        by: "<admin:1>",
      },
    });
  });

  it("keeps an unresolved PT change open", () => {
    const open = { ...events[6], resolution: null } as GroupSystemEvent;

    expect(toGroupSystemLine(open, nameOf).key).toBe(
      "systemLine.pt_changed_open",
    );
  });
});

describe("groupSystemEventKeys", () => {
  it("lists every key a line names, for one name lookup", () => {
    expect(groupSystemEventKeys(events[0])).toEqual([
      "admin:1",
      "user:2",
      "user:3",
    ]);
    expect(groupSystemEventKeys(events[6]).sort()).toEqual([
      "admin:1",
      "admin:2",
      "user:4",
    ]);
  });
});

// --- unread, seen-by and the read cursor ---------------------------------

const at = (iso: string) => new Date(iso);
const message = (
  over: Partial<GroupUnreadCandidate> = {},
): GroupUnreadCandidate => ({
  id: 10,
  kind: "message",
  senderKey: "user:2",
  audience: null,
  deletedAt: null,
  hiddenAt: null,
  createdAt: at("2026-11-10T00:00:00Z"),
  ...over,
});
const viewer = { key: "user:1", lastReadMessageId: 5 };

describe("isGroupUnreadFor", () => {
  it("counts a new message from someone else", () => {
    expect(isGroupUnreadFor(message(), viewer)).toBe(true);
  });

  it.each([
    ["own", { senderKey: "user:1" }],
    ["system line", { kind: "system" as const, senderKey: null }],
    ["alert", { kind: "system" as const, audience: "super_admin" as const }],
    ["unsent", { deletedAt: at("2026-11-11T00:00:00Z") }],
    ["hidden", { hiddenAt: at("2026-11-11T00:00:00Z") }],
    ["already read", { id: 5 }],
  ])("excludes %s", (_name, over) => {
    expect(isGroupUnreadFor(message(over), viewer)).toBe(false);
  });

  it("treats a NULL cursor (nothing read) as 0", () => {
    expect(
      isGroupUnreadFor(message({ id: 1 }), {
        key: "user:1",
        lastReadMessageId: null,
      }),
    ).toBe(true);
  });

  it("ignores messages older than a super admin's account", () => {
    const admin = { ...viewer, baselineAt: at("2026-11-12T00:00:00Z") };

    expect(isGroupUnreadFor(message(), admin)).toBe(false);
    expect(
      isGroupUnreadFor(
        message({ createdAt: at("2026-11-12T00:00:00Z") }),
        admin,
      ),
    ).toBe(true);
  });

  it("counts a list", () => {
    expect(
      countGroupUnreadFor(
        [
          message({ id: 6 }),
          message({ id: 7, senderKey: "user:1" }),
          message({ id: 8 }),
        ],
        viewer,
      ),
    ).toBe(2);
  });
});

describe("groupSeenByKeys", () => {
  const cursors = [
    { memberKey: "user:2", lastReadMessageId: 12 },
    { memberKey: "user:3", lastReadMessageId: 9 },
    { memberKey: "admin:1", lastReadMessageId: 10 },
    { memberKey: "user:4", lastReadMessageId: null },
  ];

  it("lists members at or past the message and never the sender", () => {
    expect(groupSeenByKeys({ id: 10, senderKey: "user:2" }, cursors)).toEqual([
      "admin:1",
    ]);
    expect(groupSeenByKeys({ id: 13, senderKey: "user:2" }, cursors)).toEqual(
      [],
    );
  });
});
