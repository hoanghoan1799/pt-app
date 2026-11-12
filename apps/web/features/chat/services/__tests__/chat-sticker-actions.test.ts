import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { chatMessages, users } from "@/db/schema";
import { CHAT_MESSAGES } from "@/features/chat/constants/messages";

const state = vi.hoisted(() => ({
  db: null as unknown,
  role: "user" as "user" | "admin",
  userId: 1,
  adminId: 7,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/chat/services/chat-realtime", () => ({
  publishNewMessage: vi.fn(async () => undefined),
  publishRead: vi.fn(async () => undefined),
  publishChatStatus: vi.fn(async () => undefined),
  publishMessageUpdate: vi.fn(async () => undefined),
}));
vi.mock("@/features/chat/services/chat-push", () => ({
  schedulePush: vi.fn(),
  scheduleReactionPush: vi.fn(),
}));
vi.mock("@/services/api/me", async () => {
  const { fakeAdminMe, fakeUserMe } = await import("@/services/api/testing");

  // GET /v1/auth/me is the only thing faked: the real guards run.
  return {
    fetchMe: vi.fn(async (role: string) => {
      if (role !== state.role) {
        return null;
      }
      return role === "admin"
        ? fakeAdminMe({ id: state.adminId, username: "pt" })
        : fakeUserMe({ id: state.userId });
    }),
  };
});
vi.mock("@/services/admins", () => ({
  findAdminById: vi.fn(async (id: number) => ({ id, username: "pt" })),
}));
vi.mock("@/services/users", async () => {
  const { eq: equals } = await import("drizzle-orm");
  const { users: usersTable } = await import("@/db/schema");

  return {
    findUserById: vi.fn(async (id: number) => {
      const [row] = await (state.db as TestDb)
        .select()
        .from(usersTable)
        .where(equals(usersTable.id, id));

      return row ?? null;
    }),
  };
});
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const user = await import("@/features/chat/services/chat-actions");
const admin = await import("@/features/chat/services/chat-admin-actions");
const queries = await import("@/features/chat/services/chat-queries");
const push = await import("@/features/chat/services/chat-push");

let db: TestDb;
let userId: number;

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const GIPHY_URL = "https://media2.giphy.com/media/abc123XYZ/200w.gif";
const TROPHY = { pack: "fluent", id: "trophy" };

const rows = () => db.select().from(chatMessages);

beforeEach(async () => {
  vi.mocked(push.schedulePush).mockClear();
  db = await createTestDb();
  state.db = db;
  state.role = "user";
  const [row] = await db
    .insert(users)
    .values({ name: "An", nameKey: "an", chatEnabled: true })
    .returning({ id: users.id });

  userId = row.id;
  state.userId = userId;
});

const sendSticker = async (n = 1, sticker: unknown = TROPHY) => {
  const result = await user.sendMessageAction({
    sticker,
    clientId: uuid(n),
  } as never);

  if (result.status !== "success") {
    throw new Error(`send failed: ${result.message}`);
  }
  return result.message;
};

describe("sending a sticker", () => {
  it("stores a bundled sticker with an empty body and returns the payload", async () => {
    const message = await sendSticker();

    expect(message).toMatchObject({
      body: "",
      sticker: { kind: "pack", url: "/stickers/fluent/trophy.svg", alt: "Cúp" },
    });
    expect(await rows()).toMatchObject([
      {
        body: "",
        stickerRef: "pack:trophy",
        stickerUrl: "/stickers/fluent/trophy.svg",
      },
    ]);
  });

  it("stores a GIPHY sticker with its id and media URL", async () => {
    const message = await sendSticker(1, {
      giphyId: "abc123XYZ",
      url: GIPHY_URL,
    });

    expect(message.sticker).toMatchObject({ kind: "giphy", url: GIPHY_URL });
    expect((await rows())[0]).toMatchObject({
      stickerRef: "giphy:abc123XYZ",
      stickerUrl: GIPHY_URL,
    });
  });

  it("text messages carry sticker: null", async () => {
    const result = await user.sendMessageAction({
      body: "hi",
      clientId: uuid(1),
    });

    expect(result.status === "success" && result.message.sticker).toBeNull();
  });

  it.each([
    ["an unknown id", { pack: "fluent", id: "nope" }],
    ["an unknown pack", { pack: "tiktok", id: "trophy" }],
    [
      "a non-GIPHY URL",
      { giphyId: "abc123XYZ", url: "https://evil.com/media/abc123XYZ/a.gif" },
    ],
    [
      "a GIPHY URL over http",
      { giphyId: "abc123XYZ", url: GIPHY_URL.replace("https", "http") },
    ],
    [
      "a GIPHY id that is not in the URL",
      { giphyId: "other123", url: GIPHY_URL },
    ],
  ])("rejects %s and stores nothing", async (_name, sticker) => {
    const result = await user.sendMessageAction({
      sticker,
      clientId: uuid(1),
    } as never);

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.INVALID_INPUT,
    });
    expect(await rows()).toHaveLength(0);
  });

  it("rejects a sticker together with text, and neither", async () => {
    const both = await user.sendMessageAction({
      body: "hi",
      sticker: TROPHY,
      clientId: uuid(1),
    } as never);
    const neither = await user.sendMessageAction({
      clientId: uuid(2),
    } as never);

    expect(both.status).toBe("error");
    expect(neither.status).toBe("error");
    expect(await rows()).toHaveLength(0);
  });

  it("is refused while chat is locked", async () => {
    await db.update(users).set({ chatEnabled: false });
    const result = await user.sendMessageAction({
      sticker: TROPHY,
      clientId: uuid(1),
    } as never);

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.CHAT_LOCKED,
    });
    expect(await rows()).toHaveLength(0);
  });

  it("is idempotent per clientId and pushes once, flagged as a sticker", async () => {
    await sendSticker(1);
    await sendSticker(1);

    expect(await rows()).toHaveLength(1);
    expect(push.schedulePush).toHaveBeenCalledExactlyOnceWith({
      senderRole: "user",
      traineeUserId: userId,
      conversationId: expect.any(Number),
      body: "",
      sticker: true,
    });
  });
});

describe("adminSendMessageAction with a sticker", () => {
  it("stores it for the admin sender", async () => {
    state.role = "admin";
    const result = await user.adminSendMessageAction({
      userId,
      sticker: TROPHY,
      clientId: uuid(1),
    } as never);

    expect(result.status).toBe("success");
    expect((await rows())[0]).toMatchObject({
      senderRole: "admin",
      senderAdminId: 7,
      body: "",
      stickerRef: "pack:trophy",
    });
    expect(push.schedulePush).toHaveBeenCalledWith(
      expect.objectContaining({ senderRole: "admin", sticker: true }),
    );
  });

  it("rejects a bad sticker, text plus sticker, and a locked trainee", async () => {
    state.role = "admin";
    const bad = await user.adminSendMessageAction({
      userId,
      sticker: { giphyId: "abc123XYZ", url: "https://evil.com/a.gif" },
      clientId: uuid(1),
    } as never);
    const both = await user.adminSendMessageAction({
      userId,
      body: "hi",
      sticker: TROPHY,
      clientId: uuid(2),
    } as never);

    expect(bad.status).toBe("error");
    expect(both.status).toBe("error");
    await db.update(users).set({ chatEnabled: false });
    const locked = await user.adminSendMessageAction({
      userId,
      sticker: TROPHY,
      clientId: uuid(3),
    } as never);

    expect(locked).toEqual({
      status: "error",
      message: CHAT_MESSAGES.CHAT_LOCKED,
    });
    expect(await rows()).toHaveLength(0);
  });

  it("requires an admin session", async () => {
    state.role = "user";
    await expect(
      user.adminSendMessageAction({
        userId,
        sticker: TROPHY,
        clientId: uuid(1),
      } as never),
    ).rejects.toThrow();
  });
});

describe("acting on a sticker message", () => {
  it("cannot be edited by its sender", async () => {
    const message = await sendSticker();
    const result = await user.editMessageAction({
      messageId: message.id,
      body: "text",
    });

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.STICKER_NOT_EDITABLE,
    });
    expect((await rows())[0]).toMatchObject({ body: "", editedAt: null });
  });

  it("can be reacted to by the other side", async () => {
    const message = await sendSticker();

    state.role = "admin";
    const result = await admin.adminReactMessageAction({
      conversationId: (await queries.findConversationByUserId(userId))!.id,
      messageId: message.id,
      emoji: "❤️",
    });

    expect(result.status).toBe("success");
    expect(
      result.status === "success" && result.message.reactions,
    ).toMatchObject([{ emoji: "❤️", reactorKey: "admin:7" }]);
  });

  it("can be quoted: the reply says it quotes a sticker, with no snippet", async () => {
    const sticker = await sendSticker();

    state.role = "admin";
    const reply = await user.adminSendMessageAction({
      userId,
      body: "đẹp quá",
      clientId: uuid(2),
      replyToMessageId: sticker.id,
    });

    expect(reply.status === "success" && reply.message.replyTo).toEqual({
      id: sticker.id,
      body: "",
      isSticker: true,
      isPhoto: false,
      senderRole: "user",
      deleted: false,
    });
  });

  it("a text reply target is not marked as a sticker", async () => {
    const text = await user.sendMessageAction({
      body: "hi",
      clientId: uuid(1),
    });

    state.role = "admin";
    const reply = await user.adminSendMessageAction({
      userId,
      body: "ok",
      clientId: uuid(2),
      replyToMessageId: text.status === "success" ? text.message.id : 0,
    });

    expect(reply.status === "success" && reply.message.replyTo?.isSticker).toBe(
      false,
    );
  });

  it("can be unsent: the payload loses the sticker and the quote hides it", async () => {
    const sticker = await sendSticker();
    const unsent = await user.unsendMessageAction({ messageId: sticker.id });

    expect(unsent.status === "success" && unsent.message).toMatchObject({
      deleted: true,
      body: "",
      sticker: null,
    });
    const [row] = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, sticker.id));

    expect(row.deletedAt).toBeInstanceOf(Date);
  });
});

describe("inbox preview", () => {
  it("shows the sticker text for a sticker, nothing once it is unsent", async () => {
    const sticker = await sendSticker();
    const preview = async () =>
      (await queries.listAdminInbox(7)).conversations[0].preview;

    expect(await preview()).toBe("đã gửi một sticker");
    await user.unsendMessageAction({ messageId: sticker.id });
    expect(await preview()).toBe("");
  });
});
