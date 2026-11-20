import { groupSystemEventKeys } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import { avatarToken } from "../files/image-rules.js";
import {
  groupAvatarUrl,
  type HydrateContext,
  isValidGroupAvatarToken,
  toGroupMessageView,
  toLastMessage,
} from "./group.mapper.js";
import type { MessageRow } from "./group.queries.js";

const at = new Date("2026-11-14T08:00:00.000Z");

const row = (over: Partial<MessageRow> = {}): MessageRow => ({
  id: 10,
  groupId: 3,
  kind: "message",
  senderKey: "user:1",
  body: "hello",
  systemEvent: null,
  audience: null,
  clientId: "key-1",
  replyToMessageId: null,
  stickerRef: null,
  stickerUrl: null,
  photoId: null,
  silent: false,
  deletedAt: null,
  hiddenAt: null,
  editedAt: null,
  updatedAt: null,
  createdAt: at,
  ...over,
});

const context = (over: Partial<HydrateContext> = {}): HydrateContext => ({
  viewerKey: "user:2",
  identities: new Map([
    ["user:1", { name: "An", role: "trainee", avatarUrl: null }],
    ["admin:5", { name: "Boss", role: "super_admin", avatarUrl: null }],
  ]),
  nameOf: (key) =>
    key === "user:1" ? "Nickname" : key === "admin:5" ? "Boss" : null,
  reactions: new Map(),
  photos: new Map(),
  replies: new Map(),
  replyPhotoCounts: new Map(),
  seenCounts: new Map(),
  ...over,
});

const view = (r: MessageRow, c: HydrateContext = context()) =>
  toGroupMessageView(r, c, groupSystemEventKeys);

describe("toGroupMessageView", () => {
  it("names the sender as the viewer does and tags managers", () => {
    expect(view(row())).toMatchObject({
      senderName: "Nickname",
      senderDeleted: false,
      senderTag: null,
      body: "hello",
      createdAt: at.toISOString(),
      updatedAt: null,
    });
    expect(view(row({ senderKey: "admin:5" })).senderTag).toBe("manager");
    expect(view(row({ senderKey: "user:404" }))).toMatchObject({
      senderName: null,
      senderDeleted: true,
    });
  });

  it("blanks an unsent message: no text, photos, sticker or reactions", () => {
    const c = context({
      photos: new Map([
        [10, [{ id: 7, messageId: 10, position: 0, width: 4, height: 3 }]],
      ]),
      reactions: new Map([
        [10, [{ messageId: 10, reactorKey: "user:2", emoji: "👍" }]],
      ]),
    });
    const unsent = view(
      row({ deletedAt: at, editedAt: at, photoId: 7, stickerRef: "pack:fire" }),
      c,
    );

    expect(unsent).toMatchObject({
      body: "",
      photo: null,
      photos: [],
      sticker: null,
      reactions: [],
      deleted: true,
      edited: false,
    });
  });

  it("hides the content of a hidden message but keeps its reactions", () => {
    const c = context({
      reactions: new Map([
        [10, [{ messageId: 10, reactorKey: "user:2", emoji: "👍" }]],
      ]),
    });

    expect(view(row({ hiddenAt: at }), c)).toMatchObject({
      body: "",
      hidden: true,
      reactions: [{ emoji: "👍", count: 1, mine: true }],
    });
  });

  it("serves photos through the group's own URL, cover first", () => {
    const c = context({
      photos: new Map([
        [
          10,
          [
            { id: 8, messageId: 10, position: 0, width: 4, height: 3 },
            { id: 9, messageId: 10, position: 1, width: 2, height: 2 },
          ],
        ],
      ]),
    });
    const message = view(row({ photoId: 8 }), c);

    expect(message.photo).toMatchObject({
      id: 8,
      url: "/v1/chat/groups/3/photos/8",
    });
    expect(message.photos.map((p) => p.id)).toEqual([8, 9]);
  });

  it("counts reactions per emoji, most used first, ties alphabetical", () => {
    const c = context({
      reactions: new Map([
        [
          10,
          [
            { messageId: 10, reactorKey: "user:3", emoji: "😂" },
            { messageId: 10, reactorKey: "user:2", emoji: "❤️" },
            { messageId: 10, reactorKey: "user:4", emoji: "❤️" },
            { messageId: 10, reactorKey: "user:5", emoji: "👍" },
          ],
        ],
      ]),
    });

    expect(view(row(), c).reactions).toEqual([
      { emoji: "❤️", count: 2, mine: true },
      { emoji: "👍", count: 1, mine: false },
      { emoji: "😂", count: 1, mine: false },
    ]);
  });

  it("quotes the reply target and gives a tombstone once it is gone", () => {
    const target = row({ id: 5, body: "original", senderKey: "admin:5" });
    const live = view(
      row({ replyToMessageId: 5 }),
      context({ replies: new Map([[5, target]]) }),
    );

    expect(live.replyTo).toEqual({
      id: 5,
      senderKey: "admin:5",
      senderName: "Boss",
      snippet: "original",
      unavailable: false,
      isSticker: false,
      isPhoto: false,
      photoCount: 0,
    });
    const gone = view(
      row({ replyToMessageId: 5 }),
      context({ replies: new Map([[5, { ...target, hiddenAt: at }]]) }),
    );

    expect(gone.replyTo).toMatchObject({ snippet: "", unavailable: true });
  });

  it("reads a system line's event and the names it mentions, and a broken one as none", () => {
    const line = view(
      row({
        kind: "system",
        senderKey: null,
        body: "",
        systemEvent: JSON.stringify({
          type: "member_added",
          actorKey: "admin:5",
          memberKeys: ["user:1", "user:404"],
        }),
      }),
    );

    expect(line.systemEvent).toMatchObject({ type: "member_added" });
    expect(line.eventNames).toEqual({
      "admin:5": "Boss",
      "user:1": "Nickname",
      "user:404": null,
    });
    expect(
      view(row({ kind: "system", senderKey: null, systemEvent: "{bad" }))
        .systemEvent,
    ).toBeNull();
  });
});

describe("toLastMessage", () => {
  it("previews live text only and labels media", () => {
    expect(toLastMessage({ ...row(), photoCount: 0 })).toMatchObject({
      preview: "hello",
      media: null,
      photoCount: 0,
    });
    expect(
      toLastMessage({ ...row({ deletedAt: at }), photoCount: 0 }),
    ).toMatchObject({ preview: "", media: null });
    expect(
      toLastMessage({ ...row({ photoId: 4, body: "" }), photoCount: 3 }),
    ).toMatchObject({ media: "photo", photoCount: 3 });
    expect(
      toLastMessage({
        ...row({ stickerRef: "pack:fire", body: "" }),
        photoCount: 0,
      }).media,
    ).toBe("sticker");
  });
});

describe("group avatar URL", () => {
  it("is null without a photo and signed with the version otherwise", () => {
    expect(groupAvatarUrl({ id: 3, avatarUpdatedAt: null })).toBeNull();
    const url = groupAvatarUrl({ id: 3, avatarUpdatedAt: at })!;
    const version = String(Math.floor(at.getTime() / 1000));

    expect(url).toBe(
      `/v1/chat/groups/3/avatar?v=${version}&t=${avatarToken("group", 3, version)}`,
    );
    expect(
      isValidGroupAvatarToken(3, version, avatarToken("group", 3, version)),
    ).toBe(true);
  });

  it("never accepts a token of another group, version or account kind", () => {
    const version = "1700000000";

    expect(
      isValidGroupAvatarToken(3, version, avatarToken("group", 4, version)),
    ).toBe(false);
    expect(
      isValidGroupAvatarToken(3, version, avatarToken("group", 3, "1")),
    ).toBe(false);
    expect(
      isValidGroupAvatarToken(3, version, avatarToken("user", 3, version)),
    ).toBe(false);
    expect(isValidGroupAvatarToken(3, version, undefined)).toBe(false);
  });
});
