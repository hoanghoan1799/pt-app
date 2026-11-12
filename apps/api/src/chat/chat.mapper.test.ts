import { describe, expect, it } from "vitest";

import {
  emptyContext,
  inboxPreview,
  type MessageContext,
  type MessageRow,
  reactorNameOf,
  toMessageView,
} from "./chat.mapper.js";

const NOW = new Date("2026-11-12T10:00:00.000Z");
const LATER = new Date("2026-11-12T11:00:00.000Z");

const row = (overrides: Partial<MessageRow> = {}): MessageRow => ({
  id: 5,
  conversationId: 1,
  senderRole: "user",
  senderAdminId: null,
  senderAdminName: null,
  body: "xin chào",
  stickerRef: null,
  stickerUrl: null,
  photoId: null,
  clientId: "client-1",
  createdAt: NOW,
  replyToMessageId: null,
  replyPostId: null,
  editedAt: null,
  deletedAt: null,
  updatedAt: null,
  ...overrides,
});

const context = (overrides: Partial<MessageContext> = {}): MessageContext => ({
  ...emptyContext(),
  ...overrides,
});

describe("toMessageView", () => {
  it("shapes a plain message and falls back to createdAt for updatedAt", () => {
    expect(toMessageView(row(), context())).toEqual({
      id: 5,
      senderRole: "user",
      senderAdminId: null,
      senderAdminName: null,
      body: "xin chào",
      sticker: null,
      photo: null,
      clientId: "client-1",
      createdAt: "2026-11-12T10:00:00.000Z",
      replyTo: null,
      editedAt: null,
      deleted: false,
      updatedAt: "2026-11-12T10:00:00.000Z",
      reactions: [],
      post: null,
    });
  });

  it("reports edits and the last change", () => {
    const view = toMessageView(
      row({ editedAt: LATER, updatedAt: LATER }),
      context(),
    );

    expect(view.editedAt).toBe("2026-11-12T11:00:00.000Z");
    expect(view.updatedAt).toBe("2026-11-12T11:00:00.000Z");
  });

  it("redacts an unsent message: no body, sticker, photo, quote, reactions or post", () => {
    const view = toMessageView(
      row({
        deletedAt: LATER,
        stickerRef: "pack:fire",
        stickerUrl: "/stickers/fluent/fire.svg",
        photoId: 3,
        replyToMessageId: 2,
        replyPostId: 9,
      }),
      context({
        targets: new Map([
          [
            2,
            {
              id: 2,
              conversationId: 1,
              body: "gốc",
              stickerRef: null,
              photoId: null,
              senderRole: "admin",
              deletedAt: null,
            },
          ],
        ]),
        reactions: new Map([
          [
            5,
            [
              {
                messageId: 5,
                reactorKey: "user",
                emoji: "👍",
                adminName: null,
              },
            ],
          ],
        ]),
        photoSizes: new Map([[3, { width: 1, height: 1 }]]),
        posts: new Map([[9, { id: 9, available: false as const }]]),
      }),
    );

    expect(view).toMatchObject({
      body: "",
      deleted: true,
      sticker: null,
      photo: null,
      replyTo: null,
      reactions: [],
      post: null,
    });
  });

  it("builds the photo from its size and the versioned API URL", () => {
    const view = toMessageView(
      row({ photoId: 3 }),
      context({ photoSizes: new Map([[3, { width: 640, height: 480 }]]) }),
    );

    expect(view.photo).toEqual({
      url: "/v1/chat/photos/3",
      width: 640,
      height: 480,
      alt: "Ảnh trong tin nhắn",
    });
    expect(toMessageView(row({ photoId: 3 }), context()).photo).toBeNull();
  });

  it("derives a personal sticker's URL from its ref and checks the other kinds", () => {
    const custom = toMessageView(
      row({
        stickerRef: "custom:12",
        stickerUrl: "/api/chat/stickers/custom/12",
      }),
      context(),
    );
    const forged = toMessageView(
      row({
        stickerRef: "giphy:abc",
        stickerUrl: "https://evil.example.com/a.gif",
      }),
      context(),
    );

    expect(custom.sticker).toEqual({
      kind: "custom",
      url: "/v1/chat/stickers/custom/12",
      alt: "Sticker của tôi",
    });
    expect(forged.sticker).toBeNull();
  });

  it("quotes a message of the same conversation with a snippet cut at 120 characters", () => {
    const target = {
      id: 2,
      conversationId: 1,
      body: "x".repeat(150),
      stickerRef: null,
      photoId: null,
      senderRole: "admin" as const,
      deletedAt: null,
    };
    const view = toMessageView(
      row({ replyToMessageId: 2 }),
      context({ targets: new Map([[2, target]]) }),
    );

    expect(view.replyTo).toEqual({
      id: 2,
      body: "x".repeat(120),
      isSticker: false,
      isPhoto: false,
      senderRole: "admin",
      deleted: false,
    });
  });

  it("never leaks a quote from another conversation, and shows an unsent original empty", () => {
    const foreign = {
      id: 2,
      conversationId: 99,
      body: "bí mật",
      stickerRef: null,
      photoId: null,
      senderRole: "user" as const,
      deletedAt: null,
    };
    const unsent = {
      ...foreign,
      conversationId: 1,
      deletedAt: LATER,
      stickerRef: "pack:fire",
      photoId: 4,
    };

    expect(
      toMessageView(
        row({ replyToMessageId: 2 }),
        context({ targets: new Map([[2, foreign]]) }),
      ).replyTo,
    ).toBeNull();
    expect(
      toMessageView(
        row({ replyToMessageId: 2 }),
        context({ targets: new Map([[2, unsent]]) }),
      ).replyTo,
    ).toEqual({
      id: 2,
      body: "",
      isSticker: false,
      isPhoto: false,
      senderRole: "user",
      deleted: true,
    });
  });

  it("marks a quoted sticker and a quoted photo", () => {
    const base = {
      id: 2,
      conversationId: 1,
      body: "",
      senderRole: "user" as const,
      deletedAt: null,
    };
    const sticker = toMessageView(
      row({ replyToMessageId: 2 }),
      context({
        targets: new Map([
          [2, { ...base, stickerRef: "pack:fire", photoId: null }],
        ]),
      }),
    );
    const photo = toMessageView(
      row({ replyToMessageId: 2 }),
      context({
        targets: new Map([[2, { ...base, stickerRef: null, photoId: 4 }]]),
      }),
    );

    expect(sticker.replyTo).toMatchObject({ isSticker: true, isPhoto: false });
    expect(photo.replyTo).toMatchObject({ isSticker: false, isPhoto: true });
  });

  it("names reactors: the trainee by name, an admin by username, deleted admins as PT", () => {
    const view = toMessageView(
      row(),
      context({
        traineeNames: new Map([[1, "Mai"]]),
        reactions: new Map([
          [
            5,
            [
              {
                messageId: 5,
                reactorKey: "user",
                emoji: "❤️",
                adminName: null,
              },
              {
                messageId: 5,
                reactorKey: "admin:3",
                emoji: "💪",
                adminName: "hoan",
              },
              {
                messageId: 5,
                reactorKey: "admin:4",
                emoji: "👍",
                adminName: null,
              },
            ],
          ],
        ]),
      }),
    );

    expect(view.reactions).toEqual([
      { emoji: "❤️", reactorKey: "user", reactorName: "Mai" },
      { emoji: "💪", reactorKey: "admin:3", reactorName: "hoan" },
      { emoji: "👍", reactorKey: "admin:4", reactorName: "PT" },
    ]);
    expect(
      reactorNameOf(
        { messageId: 5, reactorKey: "user", emoji: "x", adminName: null },
        undefined,
      ),
    ).toBe("Học viên");
  });

  it("passes the quoted post through for a live message only", () => {
    const post = { id: 9, available: false as const };

    expect(
      toMessageView(
        row({ replyPostId: 9 }),
        context({ posts: new Map([[9, post]]) }),
      ).post,
    ).toEqual(post);
    expect(toMessageView(row({ replyPostId: 9 }), context()).post).toBeNull();
  });
});

describe("inboxPreview", () => {
  it("is empty once unsent", () => {
    expect(
      inboxPreview({
        body: "x",
        stickerRef: null,
        photoId: null,
        deletedAt: NOW,
      }),
    ).toBe("");
  });

  it("describes stickers and photos and cuts long text at 80 characters", () => {
    expect(
      inboxPreview({
        body: "",
        stickerRef: "pack:fire",
        photoId: null,
        deletedAt: null,
      }),
    ).toBe("đã gửi một sticker");
    expect(
      inboxPreview({ body: "", stickerRef: null, photoId: 1, deletedAt: null }),
    ).toBe("📷 Ảnh");
    expect(
      inboxPreview({
        body: "bữa trưa",
        stickerRef: null,
        photoId: 1,
        deletedAt: null,
      }),
    ).toBe("📷 bữa trưa");
    expect(
      inboxPreview({
        body: "y".repeat(100),
        stickerRef: null,
        photoId: null,
        deletedAt: null,
      }),
    ).toBe("y".repeat(80));
    expect(
      inboxPreview({
        body: null,
        stickerRef: null,
        photoId: null,
        deletedAt: null,
      }),
    ).toBe("");
  });
});
