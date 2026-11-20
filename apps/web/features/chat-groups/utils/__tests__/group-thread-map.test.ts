import type { GroupMessageView } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import {
  canSendInGroup,
  groupStateOf,
  type GroupThreadWire,
  lockReasonOf,
  parseGroupThread,
  toChatMessage,
  toThreadSnapshot,
} from "@/features/chat-groups/utils/group-thread-map";

// Company features/chat-groups/utils/__tests__/group-thread-map.test.ts, on the
// API's GroupMessageView (photo URLs and the sticker come ready from the API,
// already mapped to this app's routes).

const view = (overrides: Partial<GroupMessageView> = {}): GroupMessageView => ({
  id: 7,
  groupId: 3,
  kind: "message",
  senderKey: "user:5",
  senderName: "An",
  senderDeleted: false,
  senderTag: null,
  body: "chào cả nhóm",
  systemEvent: null,
  audience: null,
  clientId: "11111111-1111-4111-8111-111111111111",
  replyTo: null,
  sticker: null,
  photo: null,
  photos: [],
  eventNames: {},
  silent: false,
  deleted: false,
  hidden: false,
  edited: false,
  reactions: [],
  seenCount: 0,
  createdAt: "2026-11-14T03:00:00.000Z",
  updatedAt: null,
  ...overrides,
});

describe("toChatMessage", () => {
  it("carries the sender key, name and tag for the shared bubbles", () => {
    const message = toChatMessage(
      view({ senderKey: "admin:2", senderName: "Coach", senderTag: "pt" }),
      "user:5",
    );

    expect(message).toMatchObject({
      id: 7,
      senderKey: "admin:2",
      senderName: "Coach",
      senderTag: "pt",
      senderRole: "admin",
      senderAdminId: 2,
      senderAdminName: "Coach",
      kind: "message",
      body: "chào cả nhóm",
      editedAt: null,
    });
  });

  it("treats a trainee sender as the user side with no admin id", () => {
    expect(toChatMessage(view(), "user:5")).toMatchObject({
      senderRole: "user",
      senderAdminId: null,
      senderAdminName: null,
    });
  });

  it("keeps the photos in order with the URL the payload carries", () => {
    const first = {
      id: 12,
      url: "/api/chat/groups/3/photos/12",
      width: 800,
      height: 600,
      alt: "Ảnh trong tin nhắn",
    };
    const second = { ...first, id: 13, url: "/api/chat/groups/3/photos/13" };
    const message = toChatMessage(
      view({ photo: first, photos: [first, second] }),
      "user:5",
    );

    expect(message.photo).toEqual({
      url: "/api/chat/groups/3/photos/12",
      width: 800,
      height: 600,
      alt: "Ảnh trong tin nhắn",
    });
    expect(message.photos?.map((photo) => photo.url)).toEqual([
      "/api/chat/groups/3/photos/12",
      "/api/chat/groups/3/photos/13",
    ]);
  });

  it("passes the sticker the API resolved", () => {
    const sticker = {
      kind: "pack" as const,
      url: "/stickers/cat/1.webp",
      alt: "Sticker",
    };

    expect(toChatMessage(view({ sticker, body: "" }), "user:5").sticker).toBe(
      sticker,
    );
  });

  it("keeps hidden and unsent flags and the empty body the API sent", () => {
    const hidden = toChatMessage(view({ hidden: true, body: "" }), "user:5");
    const unsent = toChatMessage(view({ deleted: true, body: "" }), "user:5");

    expect([hidden.hidden, hidden.body]).toEqual([true, ""]);
    expect([unsent.deleted, unsent.body]).toEqual([true, ""]);
  });

  it("expands the reaction counts and marks only my own with my key", () => {
    const message = toChatMessage(
      view({
        reactions: [
          { emoji: "❤️", count: 3, mine: true },
          { emoji: "👍", count: 1, mine: false },
        ],
      }),
      "user:5",
    );
    const keys = message.reactions.map((r) => `${r.emoji}:${r.reactorKey}`);

    expect(keys).toEqual([
      "❤️:user:5",
      "❤️:other:7:❤️:0",
      "❤️:other:7:❤️:1",
      "👍:other:7:👍:0",
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("marks an edited message with its update time", () => {
    expect(
      toChatMessage(
        view({ edited: true, updatedAt: "2026-11-14T04:00:00.000Z" }),
        "user:5",
      ).editedAt,
    ).toBe("2026-11-14T04:00:00.000Z");
  });

  it("maps the quote with sender, sticker or photo marks and the tombstone", () => {
    const replyTo = {
      id: 4,
      senderKey: "user:6",
      senderName: "Bình",
      snippet: "",
      unavailable: false,
      isSticker: false,
      isPhoto: true,
      photoCount: 1,
    };
    const message = toChatMessage(view({ replyTo }), "user:5");

    expect(message.replyTo).toEqual({
      id: 4,
      body: "",
      senderRole: "user",
      deleted: false,
      senderKey: "user:6",
      senderName: "Bình",
      isPhoto: true,
    });
    expect(
      toChatMessage(view({ replyTo: { ...replyTo, photoCount: 3 } }), "user:5")
        .replyTo?.photoCount,
    ).toBe(3);
    expect(
      toChatMessage(
        view({ replyTo: { ...replyTo, unavailable: true, isPhoto: false } }),
        "user:5",
      ).replyTo?.deleted,
    ).toBe(true);
  });

  it("gives a system line a stable client id, its event, the names and no reactions", () => {
    const event = {
      type: "member_left" as const,
      memberKey: "user:6",
    };
    const message = toChatMessage(
      view({
        id: 9,
        kind: "system",
        senderKey: null,
        senderName: null,
        clientId: null,
        body: "",
        systemEvent: event,
        eventNames: { "user:6": "Bình" },
        reactions: [{ emoji: "❤️", count: 1, mine: false }],
      }),
      "user:5",
    );

    expect(message).toMatchObject({
      clientId: "system-9",
      kind: "system",
      systemEvent: event,
      eventNames: { "user:6": "Bình" },
      reactions: [],
    });
  });
});

describe("canSendInGroup", () => {
  const base = {
    dissolved: false,
    managersOnly: false,
    isManager: false,
    canWriteBase: true,
  };

  it("everyone writes by default", () => {
    expect(canSendInGroup(base)).toBe(true);
  });

  it("managers-only keeps trainees out and managers in", () => {
    expect(canSendInGroup({ ...base, managersOnly: true })).toBe(false);
    expect(
      canSendInGroup({ ...base, managersOnly: true, isManager: true }),
    ).toBe(true);
  });

  it("a dissolved group and a blocked person are read-only", () => {
    expect(canSendInGroup({ ...base, dissolved: true, isManager: true })).toBe(
      false,
    );
    expect(canSendInGroup({ ...base, canWriteBase: false })).toBe(false);
  });
});

describe("thread snapshots", () => {
  const viewer = (
    overrides: Partial<GroupThreadWire["viewer"]> = {},
  ): GroupThreadWire["viewer"] => ({
    key: "user:5",
    role: "trainee",
    isManager: false,
    canManage: false,
    isSuperAdmin: false,
    muted: false,
    sendBlock: null,
    ...overrides,
  });
  const payload: GroupThreadWire = {
    messages: [view()],
    hasMore: true,
    changes: [view({ id: 8, body: "sửa" })],
    lastChangeAt: 1234,
    group: {
      id: 3,
      name: "Lớp sáng",
      avatarUrl: null,
      managersOnly: true,
      dissolved: false,
    },
    viewer: viewer({ sendBlock: "managers_only" }),
  };

  it("turns a payload into the snapshot the shared hook keeps", () => {
    const snapshot = toThreadSnapshot(payload, "user:5");

    expect(snapshot.messages.map((m) => m.id)).toEqual([7]);
    expect(snapshot.changes?.map((m) => m.id)).toEqual([8]);
    expect(snapshot).toMatchObject({
      hasMore: true,
      lastChangeAt: 1234,
      peerReadUpTo: 0,
      chatEnabled: false,
    });
    expect(
      toThreadSnapshot(
        { ...payload, viewer: viewer({ key: "admin:1", isManager: true }) },
        "admin:1",
      ).chatEnabled,
    ).toBe(true);
  });

  it("is read-only for a trainee whose chat is off or who is restricted", () => {
    const open = {
      ...payload,
      group: { ...payload.group, managersOnly: false },
    };

    expect(toThreadSnapshot(open, "user:5").chatEnabled).toBe(true);
    for (const sendBlock of ["chat_off", "restricted"] as const) {
      expect(
        toThreadSnapshot({ ...open, viewer: viewer({ sendBlock }) }, "user:5")
          .chatEnabled,
      ).toBe(false);
    }
  });

  it("rejects anything that is not a group payload", () => {
    expect(parseGroupThread(null, "user:5")).toBeNull();
    expect(parseGroupThread({ messages: [] }, "user:5")).toBeNull();
    expect(parseGroupThread({ error: "not_found" }, "user:5")).toBeNull();
    expect(
      parseGroupThread({ ...payload, viewer: undefined }, "user:5"),
    ).toBeNull();
    expect(parseGroupThread(payload, "user:5")?.messages).toHaveLength(1);
  });
});

describe("group state", () => {
  it("names the person's own block only for chat off and restricted", () => {
    expect(lockReasonOf("chat_off")).toBe("chat_off");
    expect(lockReasonOf("restricted")).toBe("restricted");
    expect(lockReasonOf("managers_only")).toBeNull();
    expect(lockReasonOf("dissolved")).toBeNull();
    expect(lockReasonOf(null)).toBeNull();
  });

  it("reads the header, the switches and the block from a payload", () => {
    expect(
      groupStateOf({
        group: {
          name: "Lớp sáng",
          avatarUrl: "/api/chat/groups/3/avatar?v=2&t=sig",
          managersOnly: true,
          dissolved: false,
        },
        viewer: {
          isManager: false,
          canManage: false,
          isSuperAdmin: false,
          sendBlock: "restricted",
        },
      }),
    ).toEqual({
      name: "Lớp sáng",
      avatarUrl: "/api/chat/groups/3/avatar?v=2&t=sig",
      managersOnly: true,
      dissolved: false,
      isManager: false,
      canManage: false,
      isSuperAdmin: false,
      lockReason: "restricted",
    });
  });

  it("follows a change of the manage rights from the payload", () => {
    expect(
      groupStateOf({
        group: {
          name: "Lớp sáng (đổi tên)",
          avatarUrl: null,
          managersOnly: false,
          dissolved: true,
        },
        viewer: {
          isManager: true,
          canManage: true,
          isSuperAdmin: true,
          sendBlock: "dissolved",
        },
      }),
    ).toMatchObject({
      name: "Lớp sáng (đổi tên)",
      avatarUrl: null,
      dissolved: true,
      canManage: true,
      isSuperAdmin: true,
    });
  });
});
