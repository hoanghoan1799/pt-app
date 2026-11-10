import { describe, expect, it } from "vitest";

import { reactorLabel } from "@/features/chat/utils/chat-settings";
import {
  buildThreadItems,
  mergeMessages,
  quoteLabel,
  senderLabel,
  type SerializedChatMessage,
  type ThreadMessage,
  type ThreadViewer,
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
  replyTo: null,
  editedAt: null,
  deleted: false,
  updatedAt: "2026-11-04T03:00:00.000Z",
  reactions: [],
  ...overrides,
});

const now = Date.parse("2026-11-04T05:00:00.000Z");

const firstItem = (
  list: ThreadMessage[],
  viewer: ThreadViewer,
  nicknames: Record<string, string>,
) =>
  buildThreadItems(list, 0, now, viewer, nicknames).flatMap((item) =>
    item.kind === "message" ? [item] : [],
  )[0];

describe("private nicknames in the thread (KAN-142)", () => {
  it("labels a PT with the viewer's nickname for them, then for the PT side, then the name", () => {
    const list = mergeMessages([], [msg(1)]);
    const user: ThreadViewer = { role: "user" };

    expect(
      firstItem(list, user, { "admin:1": "Coach", pt: "Thầy" }).senderName,
    ).toBe("Coach");
    expect(firstItem(list, user, { pt: "Thầy" }).senderName).toBe("Thầy");
    expect(firstItem(list, user, {}).senderName).toBe("Hoan");
  });

  it("keeps the deleted-PT label whatever the nicknames say", () => {
    const list = mergeMessages([], [msg(1, { senderAdminName: null })]);

    expect(firstItem(list, { role: "user" }, { pt: "Thầy" }).senderName).toBe(
      "PT (đã xoá)",
    );
  });

  it("names the trainee's avatar for an admin by the trainee nickname", () => {
    const list = mergeMessages(
      [],
      [
        msg(1, {
          senderRole: "user",
          senderAdminId: null,
          senderAdminName: null,
        }),
      ],
    );
    const viewer: ThreadViewer = {
      role: "admin",
      adminId: 1,
      adminName: "Hoan",
      peerName: "Lan Anh",
    };

    expect(firstItem(list, viewer, { user: "Na" }).avatarName).toBe("Na");
    expect(firstItem(list, viewer, {}).avatarName).toBe("Lan Anh");
  });

  it("labels a colleague's run for an admin by the colleague nickname", () => {
    const list = mergeMessages(
      [],
      [msg(1, { senderAdminId: 2, senderAdminName: "Minh" })],
    );
    const viewer: ThreadViewer = {
      role: "admin",
      adminId: 1,
      adminName: "Hoan",
      peerName: "Lan Anh",
    };

    expect(firstItem(list, viewer, { "admin:2": "Coach M" }).senderName).toBe(
      "Coach M",
    );
  });

  it("applies nicknames to reply quotes, the reply bar and reactors", () => {
    const quote = {
      id: 1,
      body: "x",
      senderRole: "admin" as const,
      deleted: false,
    };
    const viewer: ThreadViewer = {
      role: "admin",
      adminId: 1,
      adminName: "Hoan",
      peerName: "Lan Anh",
    };
    const nick = { pt: "Thầy", user: "Na", "admin:2": "Coach M" };

    expect(quoteLabel(quote, { role: "user" }, nick)).toBe("Thầy");
    expect(quoteLabel({ ...quote, senderRole: "user" }, viewer, nick)).toBe(
      "Na",
    );
    expect(quoteLabel(quote, { role: "user" })).toBe("PT");
    const [colleague] = mergeMessages(
      [],
      [msg(1, { senderAdminId: 2, senderAdminName: "Minh" })],
    );

    expect(senderLabel(colleague, viewer, nick)).toBe("Coach M");
    expect(senderLabel(colleague, { role: "user" }, { pt: "Thầy" })).toBe(
      "Thầy",
    );
    expect(reactorLabel(nick, "user", "Lan Anh", "admin")).toBe("Na");
    expect(reactorLabel(nick, "admin:2", "Minh", "admin")).toBe("Coach M");
    expect(reactorLabel({ pt: "Thầy" }, "admin:2", "Minh", "user")).toBe(
      "Thầy",
    );
    expect(reactorLabel({ pt: "Thầy" }, "admin:2", "Minh", "admin")).toBe(
      "Minh",
    );
  });
});
