import { describe, expect, it } from "vitest";

import {
  buildThreadItems,
  canEditOrUnsend,
  canReportGroupMessage,
  canReportMessage,
  isOwnMessage,
  mergeMessages,
  newestIncomingId,
  newestPeerMessageId,
  quoteLabel,
  senderLabel,
  type SerializedChatMessage,
  type ThreadViewer,
  toReplyTo,
  toThreadMessage,
  viewerReactorKey,
  withMyReaction,
} from "@/features/chat/utils/chat-thread-rules";

// Characterization tests written before the viewer union was widened for
// group chat: they pin how the coach chat decides "mine", names, run breaks
// and the reactor key, so any later change has to keep them green.

const NOW = Date.parse("2026-11-04T05:00:00.000Z");

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
  replyTo: null,
  editedAt: null,
  deleted: false,
  updatedAt: "2026-11-04T03:00:00.000Z",
  reactions: [],
  ...overrides,
});

const fromTrainee = (id: number) =>
  msg(id, { senderRole: "user", senderAdminId: null, senderAdminName: null });

const admin: ThreadViewer = {
  role: "admin",
  adminId: 1,
  adminName: "Hoan",
  peerName: "Lan",
};
const trainee: ThreadViewer = { role: "user" };

const items = (list: SerializedChatMessage[], viewer: ThreadViewer) =>
  buildThreadItems(mergeMessages([], list), 0, NOW, viewer).flatMap((item) =>
    item.kind === "message" ? [item] : [],
  );

describe("thread items by viewer (coach chat)", () => {
  const thread = [
    fromTrainee(1),
    msg(2),
    msg(3, { senderAdminId: 2, senderAdminName: "Minh" }),
  ];

  it("trainee: only their own side is mine, PT names show on the left", () => {
    const [own, pt1, pt2] = items(thread, trainee);

    expect([own.mine, pt1.mine, pt2.mine]).toEqual([true, false, false]);
    expect(own.senderName).toBeNull();
    expect(pt1.senderName).toBe("Hoan");
    expect(pt2.senderName).toBe("Minh");
  });

  it("admin: every admin message is mine, only a colleague is named", () => {
    const [peer, own, colleague] = items(thread, admin);

    expect([peer.mine, own.mine, colleague.mine]).toEqual([false, true, true]);
    expect([peer.senderName, own.senderName]).toEqual([null, null]);
    expect(colleague.senderName).toBe("Minh");
  });

  it("two different admins never share a run", () => {
    const [first, second] = items(
      [msg(1), msg(2, { senderAdminId: 2, senderAdminName: "Minh" })],
      trainee,
    );

    expect(first.isLastInRun).toBe(true);
    expect(second.isFirstInRun).toBe(true);
  });

  it("the avatar sits on the last bubble of the other side's run only", () => {
    const [a, b] = items([msg(1), msg(2)], trainee);

    expect([a.showAvatar, b.showAvatar]).toEqual([false, true]);
    expect(b.avatarName).toBe("Hoan");
  });
});

describe("viewer keys and read cursor", () => {
  it("identifies reactors as user or admin:<id>", () => {
    expect(viewerReactorKey(trainee)).toBe("user");
    expect(viewerReactorKey(admin)).toBe("admin:1");
  });

  it("names my reaction 'Bạn' for a trainee and the username for an admin", () => {
    expect(withMyReaction([], trainee, "❤️")).toEqual([
      { emoji: "❤️", reactorKey: "user", reactorName: "Bạn" },
    ]);
    expect(withMyReaction([], admin, "👍")).toEqual([
      { emoji: "👍", reactorKey: "admin:1", reactorName: "Hoan" },
    ]);
  });

  it("the newest peer message is the PT's for a trainee, the trainee's for an admin", () => {
    const list = mergeMessages(
      [],
      [msg(1), fromTrainee(2), msg(3), fromTrainee(4), msg(5)],
    );

    expect(newestPeerMessageId(list, "user")).toBe(5);
    expect(newestPeerMessageId(list, "admin")).toBe(4);
  });
});

describe("member viewer (group chat)", () => {
  const me: ThreadViewer = { role: "member", key: "user:5", name: "An" };
  const groupMsg = (
    id: number,
    senderKey: string | null,
    overrides: Partial<SerializedChatMessage> = {},
  ) =>
    msg(id, {
      senderRole: senderKey?.startsWith("admin") ? "admin" : "user",
      senderAdminId: null,
      senderAdminName: null,
      senderKey,
      senderName: senderKey === me.key ? "An" : `N${senderKey}`,
      ...overrides,
    });

  it("mine is decided by the sender key, everyone else is on the left", () => {
    const [own, other, pt] = items(
      [
        groupMsg(1, "user:5"),
        groupMsg(2, "user:6"),
        groupMsg(3, "admin:1", { senderTag: "pt" }),
      ],
      me,
    );

    expect([own.mine, other.mine, pt.mine]).toEqual([true, false, false]);
  });

  it("names a run of someone else once, tags it, never names me", () => {
    const [own, first, second, pt] = items(
      [
        groupMsg(1, "user:5"),
        groupMsg(2, "user:6"),
        groupMsg(3, "user:6"),
        groupMsg(4, "admin:1", { senderTag: "manager" }),
      ],
      me,
    );

    expect(own.senderName).toBeNull();
    expect(first.senderName).toBe("Nuser:6");
    expect(second.senderName).toBeNull();
    expect(second.isFirstInRun).toBe(false);
    expect(pt.senderName).toBe("Nadmin:1");
    expect(pt.senderTag).toBe("manager");
  });

  it("two members whose messages follow each other never share a run", () => {
    const [a, b] = items([groupMsg(1, "user:6"), groupMsg(2, "user:7")], me);

    expect(a.isLastInRun).toBe(true);
    expect(b.isFirstInRun).toBe(true);
  });

  it("flags a deleted sender on the first bubble of a run", () => {
    const [deleted] = items(
      [groupMsg(1, "user:9", { senderName: null, senderDeleted: true })],
      me,
    );

    expect(deleted.senderName).toBeNull();
    expect(deleted.senderDeleted).toBe(true);
  });

  it("has no one-to-one status line under my newest message", () => {
    const [own] = items([groupMsg(1, "user:5")], me);

    expect(own.statusLine).toBeNull();
  });

  it("renders a system line between bubbles and ends the run before it", () => {
    const list = buildThreadItems(
      mergeMessages(
        [],
        [
          groupMsg(1, "user:6"),
          groupMsg(2, null, { kind: "system", body: "" }),
          groupMsg(3, "user:6"),
        ],
      ),
      0,
      NOW,
      me,
    );
    const kinds = list.map((item) => item.kind);
    const bubbles = list.flatMap((item) =>
      item.kind === "message" ? [item] : [],
    );

    expect(kinds).toEqual(["day", "message", "system", "message"]);
    expect(bubbles[0].isLastInRun).toBe(true);
    expect(bubbles[1].isFirstInRun).toBe(true);
    expect(bubbles[1].senderName).toBe("Nuser:6");
  });

  it("reads up to the newest message from someone else, never system lines", () => {
    const list = mergeMessages(
      [],
      [
        groupMsg(1, "user:6"),
        groupMsg(2, "user:5"),
        groupMsg(3, null, { kind: "system" }),
      ],
    );

    expect(newestIncomingId(list, me)).toBe(1);
  });

  it("keys my reaction by my member key and owns only my messages", () => {
    const mineMessage = toThreadMessage(groupMsg(1, "user:5"));
    const theirs = toThreadMessage(groupMsg(2, "user:6"));

    expect(viewerReactorKey(me)).toBe("user:5");
    expect(withMyReaction([], me, "🔥")).toEqual([
      { emoji: "🔥", reactorKey: "user:5", reactorName: "An" },
    ]);
    expect(isOwnMessage(mineMessage, me)).toBe(true);
    expect(isOwnMessage(theirs, me)).toBe(false);
    expect(canEditOrUnsend(theirs, me)).toBe(false);
    expect(canEditOrUnsend(mineMessage, me)).toBe(true);
  });

  it("labels the reply bar and the quote with the sender's name", () => {
    const theirs = toThreadMessage(groupMsg(2, "user:6"));
    const deleted = toThreadMessage(
      groupMsg(3, "user:9", { senderName: null, senderDeleted: true }),
    );

    expect(senderLabel(theirs, me)).toBe("Nuser:6");
    expect(senderLabel(deleted, me)).toBe("Thành viên đã xoá");
    expect(
      quoteLabel(
        {
          id: 2,
          body: "x",
          senderRole: "user",
          deleted: false,
          senderKey: "user:5",
          senderName: "An",
        },
        me,
      ),
    ).toBe("Bạn");
    expect(
      quoteLabel(
        {
          id: 2,
          body: "x",
          senderRole: "user",
          deleted: false,
          senderKey: "user:6",
          senderName: "Bình",
        },
        me,
      ),
    ).toBe("Bình");
    expect(toReplyTo(theirs)).toMatchObject({
      id: 2,
      senderKey: "user:6",
      senderName: "Nuser:6",
    });
  });

  it("never offers the coach chat report to a member", () => {
    expect(canReportMessage(toThreadMessage(groupMsg(2, "admin:1")), me)).toBe(
      false,
    );
  });

  describe("canReportGroupMessage", () => {
    const theirs = toThreadMessage(groupMsg(2, "user:6"));

    it("offers another member's stored message", () => {
      expect(canReportGroupMessage(theirs, me, false)).toBe(true);
      expect(
        canReportGroupMessage(
          toThreadMessage(groupMsg(3, "admin:1")),
          me,
          false,
        ),
      ).toBe(true);
    });

    it("never offers my own message", () => {
      expect(
        canReportGroupMessage(
          toThreadMessage(groupMsg(1, "user:5")),
          me,
          false,
        ),
      ).toBe(false);
    });

    it("never offers it to a super admin", () => {
      expect(canReportGroupMessage(theirs, me, true)).toBe(false);
    });

    it.each([
      ["an unsent message", { deleted: true }],
      ["a hidden message", { hidden: true }],
      ["a system line", { kind: "system" as const }],
      ["a sender without a key", { senderKey: null }],
    ])("never offers %s", (_label, overrides) => {
      expect(
        canReportGroupMessage(
          toThreadMessage(groupMsg(4, "user:6", overrides)),
          me,
          false,
        ),
      ).toBe(false);
    });

    it("never offers an unsent-to-server message or a coach viewer", () => {
      expect(
        canReportGroupMessage({ ...theirs, delivery: "sending" }, me, false),
      ).toBe(false);
      expect(canReportGroupMessage({ ...theirs, id: null }, me, false)).toBe(
        false,
      );
      expect(canReportGroupMessage(theirs, { role: "user" }, false)).toBe(
        false,
      );
    });
  });
});
