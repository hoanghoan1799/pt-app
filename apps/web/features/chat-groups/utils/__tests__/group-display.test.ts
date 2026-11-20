import type { GroupSummary, GroupSystemEvent } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import {
  alertStateOf,
  filterCandidates,
  previewKindOf,
  selectionToIds,
  showsAlertButtons,
  systemLineOf,
  toggleSelection,
} from "@/features/chat-groups/utils/group-display";

const labels = { deletedMember: "Thành viên đã xoá", noPt: "chưa có PT" };

describe("systemLineOf", () => {
  it("names the people from the resolved names", () => {
    const line = systemLineOf(
      { type: "member_removed", actorKey: "admin:1", memberKey: "user:5" },
      { "admin:1": "Coach", "user:5": "An" },
      labels,
    );

    expect(line).toEqual({
      key: "systemLine.member_removed",
      params: { actor: "Coach", member: "An" },
    });
  });

  it("shows a deleted account as the deleted member label", () => {
    const line = systemLineOf(
      { type: "member_left", memberKey: "user:9" },
      { "user:9": null },
      labels,
    );

    expect(line.params).toEqual({ member: "Thành viên đã xoá" });
  });

  it("falls back for a key the server sent no name for", () => {
    const line = systemLineOf(
      { type: "avatar_changed", actorKey: "admin:4" },
      {},
      labels,
    );

    expect(line.params).toEqual({ actor: "Thành viên đã xoá" });
  });

  it("words an empty PT slot as no PT, in both directions", () => {
    const event: GroupSystemEvent = {
      type: "pt_changed",
      userId: 5,
      fromPtId: null,
      toPtId: 2,
      resolution: null,
    };
    const line = systemLineOf(
      event,
      { "user:5": "An", "admin:2": "Coach" },
      labels,
    );

    expect(line.key).toBe("systemLine.pt_changed_open");
    expect(line.params).toMatchObject({
      member: "An",
      from: "chưa có PT",
      to: "Coach",
    });
    expect(
      systemLineOf(
        { ...event, fromPtId: 2, toPtId: null },
        { "admin:2": "C" },
        labels,
      ).params,
    ).toMatchObject({ from: "C", to: "chưa có PT" });
  });

  it("uses a neutral line for an event this server cannot read", () => {
    expect(systemLineOf(null, {}, labels)).toEqual({
      key: "systemLine.unknown",
      params: {},
    });
  });

  it("words a resolved alert by its choice and who chose", () => {
    const line = systemLineOf(
      {
        type: "pt_changed",
        userId: 5,
        fromPtId: 1,
        toPtId: 2,
        resolution: { choice: "remove", byAdminId: 3, at: 1 },
      },
      { "user:5": "An", "admin:1": "A", "admin:2": "B", "admin:3": "Boss" },
      labels,
    );

    expect(line.key).toBe("systemLine.pt_changed_remove");
    expect(line.params).toMatchObject({ by: "Boss" });
  });
});

describe("alert state and buttons", () => {
  const open: GroupSystemEvent = {
    type: "pt_changed",
    userId: 5,
    fromPtId: 1,
    toPtId: 2,
    resolution: null,
  };

  it("is open until resolved, then follows the choice", () => {
    expect(alertStateOf(open)).toBe("open");
    expect(
      alertStateOf({
        ...open,
        resolution: { choice: "keep", byAdminId: 3, at: 1 },
      }),
    ).toBe("keep");
    expect(
      alertStateOf({
        ...open,
        resolution: { choice: "superseded", byAdminId: null, at: 1 },
      }),
    ).toBe("superseded");
  });

  it("is not an alert for any other line or an unreadable one", () => {
    expect(
      alertStateOf({ type: "member_left", memberKey: "user:1" }),
    ).toBeNull();
    expect(alertStateOf(null)).toBeNull();
  });

  it("shows the buttons only for a super admin and only while open", () => {
    expect(showsAlertButtons(open, true)).toBe(true);
    expect(showsAlertButtons(open, false)).toBe(false);
    expect(
      showsAlertButtons(
        { ...open, resolution: { choice: "keep", byAdminId: 3, at: 1 } },
        true,
      ),
    ).toBe(false);
    expect(showsAlertButtons(null, true)).toBe(false);
  });
});

describe("previewKindOf", () => {
  type LastMessage = NonNullable<GroupSummary["lastMessage"]>;
  const last = (overrides: Partial<LastMessage>): LastMessage => ({
    id: 1,
    kind: "message",
    senderKey: "user:5",
    preview: "chào",
    media: null,
    photoCount: 0,
    systemEvent: null,
    createdAt: "1970-01-01T00:00:00.000Z",
    ...overrides,
  });

  it("reads each kind of last message", () => {
    expect(previewKindOf(null)).toBe("none");
    expect(previewKindOf(last({}))).toBe("text");
    expect(previewKindOf(last({ preview: "", media: "photo" }))).toBe("photo");
    expect(previewKindOf(last({ preview: "", media: "sticker" }))).toBe(
      "sticker",
    );
    expect(previewKindOf(last({ preview: "" }))).toBe("unsent");
    expect(previewKindOf(last({ kind: "system", preview: "" }))).toBe("system");
  });
});

describe("member picker", () => {
  const people = [
    { key: "user:1", name: "Nguyễn Đức An" },
    { key: "user:2", name: "Lê Bình" },
    { key: "admin:3", name: "Coach Dũng" },
  ];

  it("filters ignoring case and accents, and keeps everyone for an empty query", () => {
    expect(filterCandidates(people, "duc an").map((p) => p.key)).toEqual([
      "user:1",
    ]);
    expect(filterCandidates(people, "DŨNG").map((p) => p.key)).toEqual([
      "admin:3",
    ]);
    expect(filterCandidates(people, "  ")).toHaveLength(3);
    expect(filterCandidates(people, "zzz")).toEqual([]);
  });

  it("toggles a key on and off", () => {
    const one = toggleSelection(new Set(), "user:1");

    expect([...one]).toEqual(["user:1"]);
    expect([...toggleSelection(one, "user:1")]).toEqual([]);
  });

  it("refuses to go past the cap and leaves the selection as it was", () => {
    const full = new Set(["user:1", "user:2"]);

    expect(toggleSelection(full, "user:3", 2)).toBe(full);
    expect([...toggleSelection(full, "user:2", 2)]).toEqual(["user:1"]);
  });

  it("splits a selection into user and PT ids and drops anything malformed", () => {
    expect(
      selectionToIds(
        new Set(["user:4", "admin:9", "user:x", "other:1", "user:0"]),
      ),
    ).toEqual({ userIds: [4], ptIds: [9] });
  });
});
