import { describe, expect, it } from "vitest";

import {
  buildThreadItems,
  dayLabel,
  firstStoredId,
  initialsOf,
  isNearBottom,
  lastStoredId,
  latestAdminName,
  mergeMessages,
  newestPeerMessageId,
  pollIntervalFor,
  realtimeStateFor,
  type SerializedChatMessage,
  shouldMarkRead,
  type ThreadMessage,
  toThreadMessage,
} from "@/features/chat/utils/chat-thread-rules";

const msg = (
  id: number,
  overrides: Partial<SerializedChatMessage> = {},
): SerializedChatMessage => ({
  id,
  senderRole: "admin",
  senderAdminId: 1,
  senderAdminName: "Hoan",
  body: `m${id}`,
  clientId: `c${id}`,
  createdAt: "2026-11-04T03:00:00.000Z",
  ...overrides,
});

const pendingMsg = (
  clientId: string,
  createdAt = "2026-11-04T03:05:00.000Z",
): ThreadMessage => ({
  id: null,
  senderRole: "user",
  senderAdminId: null,
  senderAdminName: null,
  body: "đang gửi",
  clientId,
  createdAt,
  delivery: "sending",
});

const ids = (messages: ThreadMessage[]) => messages.map((m) => m.id);

describe("mergeMessages", () => {
  it("sorts by id and drops duplicate ids", () => {
    const merged = mergeMessages(
      [toThreadMessage(msg(2))],
      [msg(3), msg(1), msg(2)],
    );

    expect(ids(merged)).toEqual([1, 2, 3]);
  });

  it("replaces the optimistic bubble that has the same clientId", () => {
    const current = [toThreadMessage(msg(1)), pendingMsg("abc")];
    const merged = mergeMessages(current, [
      msg(2, { senderRole: "user", senderAdminId: null, clientId: "abc" }),
    ]);

    expect(ids(merged)).toEqual([1, 2]);
    expect(merged[1].delivery).toBe("sent");
  });

  it("keeps unconfirmed bubbles last, oldest first", () => {
    const current = [
      pendingMsg("late", "2026-11-04T03:09:00.000Z"),
      pendingMsg("early", "2026-11-04T03:06:00.000Z"),
    ];
    const merged = mergeMessages(current, [msg(5)]);

    expect(merged.map((m) => m.clientId)).toEqual(["c5", "early", "late"]);
  });
});

describe("stored id helpers", () => {
  const list = mergeMessages([pendingMsg("p")], [msg(4), msg(7)]);

  it("finds the first and last stored id, ignoring pending", () => {
    expect(firstStoredId(list)).toBe(4);
    expect(lastStoredId(list)).toBe(7);
  });

  it("returns 0 / null for an empty or pending-only list", () => {
    expect(lastStoredId([pendingMsg("p")])).toBe(0);
    expect(firstStoredId([pendingMsg("p")])).toBeNull();
  });

  it("finds the newest PT message", () => {
    const mixed = mergeMessages(
      [],
      [msg(1), msg(2, { senderRole: "user", senderAdminId: null }), msg(3)],
    );

    expect(newestPeerMessageId(mixed)).toBe(3);
    expect(newestPeerMessageId(mixed.slice(1, 2))).toBe(0);
  });
});

describe("shouldMarkRead", () => {
  it("only when the newest PT message moved past the last report", () => {
    expect(shouldMarkRead(5, 4)).toBe(true);
    expect(shouldMarkRead(5, 5)).toBe(false);
    expect(shouldMarkRead(0, 0)).toBe(false);
  });
});

describe("pollIntervalFor", () => {
  it("polls every 3 s without realtime and every 5 s when degraded", () => {
    expect(pollIntervalFor("unavailable", false)).toBe(3000);
    expect(pollIntervalFor("connecting", false)).toBe(3000);
    expect(pollIntervalFor("degraded", false)).toBe(5000);
  });

  it("does not poll while connected or while the tab is hidden", () => {
    expect(pollIntervalFor("connected", false)).toBeNull();
    expect(pollIntervalFor("unavailable", true)).toBeNull();
    expect(pollIntervalFor("degraded", true)).toBeNull();
  });
});

describe("realtimeStateFor", () => {
  it("maps Ably connection states", () => {
    expect(realtimeStateFor("connected")).toBe("connected");
    expect(realtimeStateFor("suspended")).toBe("degraded");
    expect(realtimeStateFor("disconnected")).toBe("degraded");
    expect(realtimeStateFor("failed")).toBe("degraded");
    expect(realtimeStateFor("closed")).toBe("unavailable");
    expect(realtimeStateFor("connecting")).toBe("connecting");
    expect(realtimeStateFor("initialized")).toBe("connecting");
  });
});

describe("dayLabel", () => {
  // 2026-11-04 12:00 in Ho Chi Minh (UTC+7).
  const now = Date.parse("2026-11-04T05:00:00.000Z");

  it("says today, yesterday, then dd/MM in the app time zone", () => {
    expect(dayLabel("2026-11-04T01:00:00.000Z", now)).toBe("Hôm nay");
    expect(dayLabel("2026-11-03T05:00:00.000Z", now)).toBe("Hôm qua");
    expect(dayLabel("2026-10-30T05:00:00.000Z", now)).toBe("30/10");
  });

  it("uses the Ho Chi Minh day, not UTC", () => {
    // 20:00 UTC on the 3rd is already the 4th in Vietnam.
    expect(dayLabel("2026-11-03T20:00:00.000Z", now)).toBe("Hôm nay");
  });
});

describe("buildThreadItems", () => {
  const now = Date.parse("2026-11-04T05:00:00.000Z");

  it("adds a day separator first and groups a run of PT messages", () => {
    const list = mergeMessages(
      [],
      [
        msg(1, { createdAt: "2026-11-04T03:00:00.000Z" }),
        msg(2, { createdAt: "2026-11-04T03:01:00.000Z" }),
      ],
    );
    const items = buildThreadItems(list, 0, now);

    expect(items.map((i) => i.kind)).toEqual(["day", "message", "message"]);
    const [, first, second] = items;

    expect(first).toMatchObject({
      isFirstInRun: true,
      isLastInRun: false,
      senderName: "Hoan",
      showAvatar: false,
    });
    expect(second).toMatchObject({
      isFirstInRun: false,
      isLastInRun: true,
      senderName: null,
      showAvatar: true,
    });
  });

  it("inserts a time stamp after more than 15 minutes and restarts the run", () => {
    const list = mergeMessages(
      [],
      [
        msg(1, { createdAt: "2026-11-04T03:00:00.000Z" }),
        msg(2, { createdAt: "2026-11-04T03:16:00.000Z" }),
      ],
    );
    const items = buildThreadItems(list, 0, now);

    expect(items.map((i) => i.kind)).toEqual([
      "day",
      "message",
      "time",
      "message",
    ]);
    expect(items[2]).toMatchObject({ kind: "time", label: "10:16" });
    expect(items[3]).toMatchObject({ isFirstInRun: true, senderName: "Hoan" });
    expect(items[1]).toMatchObject({ isLastInRun: true, showAvatar: true });
  });

  it("exactly 15 minutes does not break the run", () => {
    const list = mergeMessages(
      [],
      [
        msg(1, { createdAt: "2026-11-04T03:00:00.000Z" }),
        msg(2, { createdAt: "2026-11-04T03:15:00.000Z" }),
      ],
    );

    expect(buildThreadItems(list, 0, now).map((i) => i.kind)).toEqual([
      "day",
      "message",
      "message",
    ]);
  });

  it("shows PT (đã xoá) when the admin name is gone", () => {
    const list = mergeMessages([], [msg(1, { senderAdminName: null })]);

    expect(buildThreadItems(list, 0, now)[1]).toMatchObject({
      senderName: "PT (đã xoá)",
    });
  });

  it("puts the status line only under my newest stored message", () => {
    const mine = { senderRole: "user" as const, senderAdminId: null };
    const list = mergeMessages([], [msg(1, mine), msg(2, mine), msg(3)]);
    const lines = (readUpTo: number) =>
      buildThreadItems(list, readUpTo, now).flatMap((i) =>
        i.kind === "message" ? [i.statusLine] : [],
      );

    expect(lines(0)).toEqual([null, "Đã gửi", null]);
    expect(lines(1)).toEqual([null, "Đã gửi", null]);
    expect(lines(2)).toEqual([null, "Đã xem", null]);
  });

  it("starts a new run when the sender changes and splits days", () => {
    const list = mergeMessages(
      [],
      [
        msg(1, { createdAt: "2026-11-03T03:00:00.000Z" }),
        msg(2, {
          senderRole: "user",
          senderAdminId: null,
          createdAt: "2026-11-04T03:00:00.000Z",
        }),
      ],
    );
    const items = buildThreadItems(list, 0, now);

    expect(items.map((i) => (i.kind === "day" ? i.label : i.kind))).toEqual([
      "Hôm qua",
      "message",
      "Hôm nay",
      "message",
    ]);
  });
});

describe("small helpers", () => {
  it("builds initials", () => {
    expect(initialsOf("Hoan Nguyen")).toBe("HN");
    expect(initialsOf("hoan")).toBe("HO");
    expect(initialsOf(null)).toBe("PT");
  });

  it("detects near-bottom scroll positions", () => {
    expect(isNearBottom(1000, 880, 100)).toBe(true);
    expect(isNearBottom(1000, 500, 100)).toBe(false);
  });
});

describe("admin viewer", () => {
  const now = Date.parse("2026-11-04T05:00:00.000Z");
  const viewer = {
    role: "admin" as const,
    adminId: 1,
    adminName: "Hoan",
    peerName: "Lan Anh",
  };
  const traineeMsg = (id: number, createdAt = "2026-11-04T03:00:00.000Z") =>
    msg(id, {
      senderRole: "user",
      senderAdminId: null,
      senderAdminName: null,
      createdAt,
    });
  const messageItems = (list: ThreadMessage[], readUpTo = 0) =>
    buildThreadItems(list, readUpTo, now, viewer).flatMap((item) =>
      item.kind === "message" ? [item] : [],
    );

  it("puts every admin message on the right and the trainee on the left", () => {
    const [trainee, own, colleague] = messageItems(
      mergeMessages(
        [],
        [
          traineeMsg(1),
          msg(2, { senderAdminId: 1 }),
          msg(3, { senderAdminId: 2, senderAdminName: "Minh" }),
        ],
      ),
    );

    expect(trainee.mine).toBe(false);
    expect(own.mine).toBe(true);
    expect(colleague.mine).toBe(true);
  });

  it("labels a colleague's run above its first bubble only, never my own or the trainee's", () => {
    const [trainee, own, colleague1, colleague2] = messageItems(
      mergeMessages(
        [],
        [
          traineeMsg(1),
          msg(2, { senderAdminId: 1 }),
          msg(3, { senderAdminId: 2, senderAdminName: "Minh" }),
          msg(4, { senderAdminId: 2, senderAdminName: "Minh" }),
        ],
      ),
    );

    expect(trainee.senderName).toBeNull();
    expect(own.senderName).toBeNull();
    expect(colleague1.senderName).toBe("Minh");
    expect(colleague2.senderName).toBeNull();
    expect(colleague1.isFirstInRun).toBe(true);
    expect(own.isLastInRun).toBe(true);
  });

  it("falls back to the deleted-PT label for a colleague without a name", () => {
    const [item] = messageItems(
      mergeMessages([], [msg(1, { senderAdminId: 9, senderAdminName: null })]),
    );

    expect(item.senderName).toBe("PT (đã xoá)");
  });

  it("shows the trainee's initials on the avatar of the trainee side", () => {
    const [item] = messageItems(mergeMessages([], [traineeMsg(1)]));

    expect(item.avatarName).toBe("Lan Anh");
    expect(item.showAvatar).toBe(true);
  });

  it("puts the status line under the newest stored admin message, from the trainee's cursor", () => {
    const list = mergeMessages(
      [],
      [msg(1), traineeMsg(2), msg(3, { senderAdminId: 2 }), traineeMsg(4)],
    );
    const statuses = (readUpTo: number) =>
      messageItems(list, readUpTo).map((item) => item.statusLine);

    expect(statuses(0)).toEqual([null, null, "Đã gửi", null]);
    expect(statuses(2)).toEqual([null, null, "Đã gửi", null]);
    expect(statuses(3)).toEqual([null, null, "Đã xem", null]);
  });

  it("still groups trainee messages into one run", () => {
    const [first, second] = messageItems(
      mergeMessages([], [traineeMsg(1), traineeMsg(2)]),
    );

    expect(first.isFirstInRun).toBe(true);
    expect(first.showAvatar).toBe(false);
    expect(second.isFirstInRun).toBe(false);
    expect(second.showAvatar).toBe(true);
  });
});

describe("newestPeerMessageId for an admin viewer", () => {
  it("returns the newest trainee message, ignoring admin and pending ones", () => {
    const list = mergeMessages(
      [],
      [
        msg(1, { senderRole: "user", senderAdminId: null }),
        msg(2),
        msg(3, { senderRole: "user", senderAdminId: null }),
        msg(4),
      ],
    );

    expect(newestPeerMessageId(list, "admin")).toBe(3);
    expect(newestPeerMessageId(list, "user")).toBe(4);
    expect(newestPeerMessageId([pendingMsg("x")], "admin")).toBe(0);
  });
});

describe("latestAdminName", () => {
  it("names the admin of the newest stored admin message", () => {
    const list = mergeMessages(
      [],
      [
        msg(1, { senderAdminName: "Hoan" }),
        msg(2, { senderAdminId: 2, senderAdminName: "Minh" }),
        msg(3, {
          senderRole: "user",
          senderAdminId: null,
          senderAdminName: null,
        }),
      ],
    );

    expect(latestAdminName(list)).toBe("Minh");
  });

  it("is null without admin messages or when the newest admin was deleted", () => {
    expect(latestAdminName([])).toBeNull();
    expect(latestAdminName([pendingMsg("x")])).toBeNull();
    expect(
      latestAdminName(
        mergeMessages([], [msg(1), msg(2, { senderAdminName: null })]),
      ),
    ).toBeNull();
  });
});
