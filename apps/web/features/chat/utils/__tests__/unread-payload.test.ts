import { describe, expect, it } from "vitest";

import {
  adminBadgeCount,
  parseAdminUnread,
  parseGroupUnread,
  parseUserUnread,
  userBadgeCount,
} from "@/features/chat/utils/unread-payload";

const groups = {
  total: 5,
  perGroup: [
    { groupId: 3, unread: 2 },
    { groupId: 7, unread: 3 },
  ],
};

describe("parseGroupUnread", () => {
  it("reads the groups field", () => {
    expect(parseGroupUnread({ groups })).toEqual(groups);
  });

  it.each([null, undefined, 5, "x", {}, { groups: null }, { groups: [] }])(
    "falls back to nothing for %j",
    (data) => {
      expect(parseGroupUnread(data)).toEqual({ total: 0, perGroup: [] });
    },
  );

  it("drops rows without a numeric group id and bad counts", () => {
    expect(
      parseGroupUnread({
        groups: {
          total: "7",
          perGroup: [
            { groupId: "1", unread: 2 },
            { groupId: 4, unread: "x" },
            null,
            { groupId: 9, unread: 1 },
          ],
        },
      }),
    ).toEqual({
      total: 0,
      perGroup: [
        { groupId: 4, unread: 0 },
        { groupId: 9, unread: 1 },
      ],
    });
  });
});

describe("existing fields are unchanged", () => {
  it("parses the trainee payload with and without groups", () => {
    const base = { count: 4, coachCount: 3, latestLoudIncomingId: 12 };

    expect(parseUserUnread(base)).toEqual({
      ...base,
      groups: { total: 0, perGroup: [] },
    });
    expect(parseUserUnread({ ...base, groups })).toEqual({ ...base, groups });
  });

  it("parses the admin payload with and without groups", () => {
    const row = {
      userId: 1,
      conversationId: 2,
      unread: 3,
      latestLoudIncomingId: null,
    };

    expect(parseAdminUnread({ count: 3, perTrainee: [row] })).toEqual({
      count: 3,
      perTrainee: [row],
      groups: { total: 0, perGroup: [] },
    });
    expect(
      parseAdminUnread({ count: 3, perTrainee: [row], groups }).groups,
    ).toEqual(groups);
  });
});

describe("adminBadgeCount", () => {
  it("adds the group total to the trainee chats", () => {
    expect(adminBadgeCount({ count: 4, groups }, 0)).toBe(9);
  });

  it("is the trainee total when the payload has no groups", () => {
    expect(adminBadgeCount({ count: 4 }, 0)).toBe(4);
  });

  it("shows the server-rendered number before the first poll", () => {
    expect(adminBadgeCount(null, 6)).toBe(6);
    expect(adminBadgeCount({ groups }, 6)).toBe(6);
  });
});

describe("userBadgeCount", () => {
  it("adds the group total to the coach and friend chat count", () => {
    expect(userBadgeCount({ count: 2, coachCount: 1, groups }, 0)).toBe(7);
  });

  it("counts groups even when nothing else is unread", () => {
    expect(userBadgeCount({ count: 0, groups }, 0)).toBe(5);
  });

  it("is the old number when the payload has no groups", () => {
    expect(userBadgeCount({ count: 3 }, 0)).toBe(3);
  });

  it("shows the initial number before the first poll or on a bad payload", () => {
    expect(userBadgeCount(null, 4)).toBe(4);
    expect(userBadgeCount({ count: "x", groups }, 4)).toBe(4);
  });
});
