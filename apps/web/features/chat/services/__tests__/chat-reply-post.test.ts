import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  admins,
  chatMessages,
  socialPostPhotos,
  socialPosts,
  users,
} from "@/db/schema";
import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import type { SocialActor } from "@/features/social/types/social";

const state = vi.hoisted(() => ({
  db: null as unknown,
  role: "user" as "user" | "admin",
  userId: 1,
  adminId: 1,
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
vi.mock("@/services/session", () => ({
  readSession: vi.fn(async () =>
    state.role === "admin"
      ? { role: "admin", adminId: state.adminId }
      : { role: "user", userId: state.userId },
  ),
}));
vi.mock("@/services/admins", () => ({
  findAdminById: vi.fn(async (id: number) => ({
    id,
    username: `pt${id}`,
    role: "super_admin",
  })),
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
const queries = await import("@/features/chat/services/chat-queries");
const replyPost = await import("@/features/chat/services/chat-reply-post");

let db: TestDb;
let anId: number;
let boId: number;
let conversationId: number;
let seq = 0;

// Viewers for direct reads: the trainee, a super admin, and a PT whose
// workspace does not hold the trainee (sees only what the privacy allows).
const anViewer = (): SocialActor => ({ kind: "user", id: anId });
const superViewer: SocialActor = { kind: "admin", id: 1, role: "super_admin" };
const ptViewer: SocialActor = { kind: "admin", id: 2, role: "pt" };

const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const actAs = (role: "user" | "admin", adminId = 1) => {
  state.role = role;
  state.adminId = adminId;
};

const addPost = async (
  authorKind: "user" | "admin",
  authorId: number,
  privacy: "everyone" | "friends" | "only_me" = "everyone",
  caption = "Bài tập hôm nay",
) => {
  const now = new Date();
  const [row] = await db
    .insert(socialPosts)
    .values({
      authorKind,
      authorId,
      privacy,
      caption,
      photoId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: socialPosts.id });

  return row.id;
};

const traineeSends = (postId: number | undefined, body = "Hay quá!") =>
  user.sendMessageAction({ clientId: uuid(), body, postId });

const adminSends = (postId: number | undefined, body = "Làm tốt lắm!") =>
  user.adminSendMessageAction({
    userId: anId,
    clientId: uuid(),
    body,
    postId,
  });

const storedPostId = async (messageId: number) =>
  (
    await db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
  )[0].replyPostId;

beforeEach(async () => {
  vi.clearAllMocks();
  db = await createTestDb();
  state.db = db;
  actAs("user");
  await db.insert(admins).values([
    { username: "pt1", usernameKey: "pt1", passwordHash: "x" },
    { username: "pt2", usernameKey: "pt2", passwordHash: "x" },
  ]);
  const rows = await db
    .insert(users)
    .values([
      { name: "An", nameKey: "an", chatEnabled: true },
      { name: "Bo", nameKey: "bo", chatEnabled: true },
    ])
    .returning({ id: users.id });

  anId = rows[0].id;
  boId = rows[1].id;
  state.userId = anId;
  conversationId = (await queries.getOrCreateConversation(anId)).id;
});

describe("trainee replies to an admin post", () => {
  it("stores the post id and previews it with the admin name for both sides", async () => {
    const postId = await addPost("admin", 1, "everyone", "Squat 3x10");
    const sent = await traineeSends(postId);

    expect(sent.status).toBe("success");
    if (sent.status !== "success") {
      return;
    }
    expect(sent.message.body).toBe("Hay quá!");
    expect(sent.message.post).toEqual({
      id: postId,
      available: true,
      authorName: "pt1",
      authorAvatarUrl: null,
      caption: "Squat 3x10",
      photo: null,
    });
    expect(await storedPostId(sent.message.id)).toBe(postId);

    const asAdmin = await queries.findMessageById(sent.message.id, superViewer);

    expect(asAdmin?.post).toEqual(sent.message.post);
  });

  it("accepts a post of any admin, not only the one who wrote last", async () => {
    const postId = await addPost("admin", 2);
    const sent = await traineeSends(postId);

    expect(sent.status === "success" && sent.message.post).toMatchObject({
      id: postId,
      available: true,
      authorName: "pt2",
    });
  });

  it("includes the photo of the post", async () => {
    const [photo] = await db
      .insert(socialPostPhotos)
      .values({
        uploaderKey: "admin:1",
        postId: 1,
        mime: "image/webp",
        width: 800,
        height: 600,
        data: Buffer.from("x"),
        size: 1,
        createdAt: new Date(),
      })
      .returning({ id: socialPostPhotos.id });
    const postId = await addPost("admin", 1);

    await db
      .update(socialPosts)
      .set({ photoId: photo.id })
      .where(eq(socialPosts.id, postId));
    const sent = await traineeSends(postId);

    expect(sent.status === "success" && sent.message.post).toMatchObject({
      available: true,
      photo: { url: `/api/social/photos/${photo.id}`, width: 800, height: 600 },
    });
  });

  it("rejects a trainee post, even the trainee's own", async () => {
    const own = await addPost("user", anId);
    const other = await addPost("user", boId);

    for (const postId of [own, other]) {
      expect(await traineeSends(postId)).toEqual({
        status: "error",
        message: CHAT_MESSAGES.POST_NOT_FOUND,
      });
    }
    expect(await db.select().from(chatMessages)).toEqual([]);
  });

  it("rejects a private, deleted or unknown admin post", async () => {
    const hidden = await addPost("admin", 1, "only_me");
    const deleted = await addPost("admin", 1);

    await db
      .update(socialPosts)
      .set({ deletedAt: new Date() })
      .where(eq(socialPosts.id, deleted));

    for (const postId of [hidden, deleted, 9999]) {
      expect(await traineeSends(postId)).toEqual({
        status: "error",
        message: CHAT_MESSAGES.POST_NOT_FOUND,
      });
    }
  });

  it("needs a text (a command alone leaves none)", async () => {
    const postId = await addPost("admin", 1);

    expect(await traineeSends(postId, "   ")).toMatchObject({
      status: "error",
    });
    expect(await traineeSends(postId, "/imlang")).toEqual({
      status: "error",
      message: CHAT_MESSAGES.INVALID_INPUT,
    });
    expect(
      await user.sendMessageAction({ clientId: uuid(), postId } as never),
    ).toEqual({ status: "error", message: CHAT_MESSAGES.INVALID_INPUT });
    expect(await db.select().from(chatMessages)).toEqual([]);
  });

  it("stays idempotent for a retried clientId, even after the post went private", async () => {
    const postId = await addPost("admin", 1);
    const clientId = uuid();
    const first = await user.sendMessageAction({
      clientId,
      body: "Hay quá!",
      postId,
    });

    await db
      .update(socialPosts)
      .set({ privacy: "only_me" })
      .where(eq(socialPosts.id, postId));
    const retry = await user.sendMessageAction({
      clientId,
      body: "Hay quá!",
      postId,
    });

    expect(first.status === "success" && first.message.id).toBeTruthy();
    expect(retry.status === "success" && retry.message.id).toBe(
      first.status === "success" ? first.message.id : -1,
    );
    expect(retry.status === "success" && retry.message.post).toEqual({
      id: postId,
      available: false,
    });
    expect(await db.select().from(chatMessages)).toHaveLength(1);
  });

  it("is read-only when the chat is locked", async () => {
    const postId = await addPost("admin", 1);

    await db.update(users).set({ chatEnabled: false });
    expect(await traineeSends(postId)).toEqual({
      status: "error",
      message: CHAT_MESSAGES.CHAT_LOCKED,
    });
  });
});

describe("admin replies to the trainee's post", () => {
  beforeEach(() => actAs("admin", 1));

  it("stores the post id and previews it for both sides", async () => {
    const postId = await addPost("user", anId, "everyone", "PR mới!");
    const sent = await adminSends(postId);

    expect(sent.status).toBe("success");
    if (sent.status !== "success") {
      return;
    }
    const expected = {
      id: postId,
      available: true,
      authorName: "An",
      authorAvatarUrl: null,
      caption: "PR mới!",
      photo: null,
    };

    expect(sent.message.post).toEqual(expected);
    expect(await storedPostId(sent.message.id)).toBe(postId);
    expect(
      (await queries.findMessageById(sent.message.id, anViewer()))?.post,
    ).toEqual(expected);
  });

  it("rejects a post of a different trainee and of an admin", async () => {
    const otherTrainee = await addPost("user", boId);
    const adminPost = await addPost("admin", 2);

    for (const postId of [otherTrainee, adminPost, 9999]) {
      expect(await adminSends(postId)).toEqual({
        status: "error",
        message: CHAT_MESSAGES.POST_NOT_FOUND,
      });
    }
    expect(await db.select().from(chatMessages)).toEqual([]);
  });

  it("rejects a deleted post and a blank text", async () => {
    const postId = await addPost("user", anId);

    expect(await adminSends(postId, "/imlang")).toEqual({
      status: "error",
      message: CHAT_MESSAGES.INVALID_INPUT,
    });
    await db.update(socialPosts).set({ deletedAt: new Date() });
    expect(await adminSends(postId)).toEqual({
      status: "error",
      message: CHAT_MESSAGES.POST_NOT_FOUND,
    });
  });

  it("works without a post as before", async () => {
    const sent = await adminSends(undefined);

    expect(sent.status === "success" && sent.message.post).toBeNull();
  });
});

describe("previews are checked per viewer on every read", () => {
  it("shows the trainee { id, available: false } after an admin post goes private", async () => {
    const postId = await addPost("admin", 1);
    const sent = await traineeSends(postId);
    const messageId = sent.status === "success" ? sent.message.id : -1;

    await db
      .update(socialPosts)
      .set({ privacy: "only_me" })
      .where(eq(socialPosts.id, postId));

    const trainee = await queries.listMessages(conversationId, {}, anViewer());
    const changes = await queries.findMessageById(messageId, anViewer());

    expect(trainee.messages[0].post).toEqual({ id: postId, available: false });
    expect(changes?.post).toEqual({ id: postId, available: false });
    // The author still sees their own post.
    expect(
      (await queries.findMessageById(messageId, superViewer))?.post,
    ).toMatchObject({ id: postId, available: true });
  });

  it("hides a trainee's post that went private from a PT outside their workspace", async () => {
    actAs("admin", 1);
    const postId = await addPost("user", anId);
    const sent = await adminSends(postId);
    const messageId = sent.status === "success" ? sent.message.id : -1;

    expect(
      (await queries.findMessageById(messageId, ptViewer))?.post,
    ).toMatchObject({ id: postId, available: true });
    await db
      .update(socialPosts)
      .set({ privacy: "only_me" })
      .where(eq(socialPosts.id, postId));

    expect((await queries.findMessageById(messageId, ptViewer))?.post).toEqual({
      id: postId,
      available: false,
    });
    expect(
      (await queries.listChanges(conversationId, 0, 0, ptViewer)).changes,
    ).toEqual([]);
    expect(
      (await queries.findMessageById(messageId, anViewer()))?.post,
    ).toMatchObject({ id: postId, available: true });
  });

  it("gives no preview when the caller names no viewer", async () => {
    const postId = await addPost("admin", 1);
    const sent = await traineeSends(postId);

    expect(
      (await queries.listMessages(conversationId)).messages[0].post,
    ).toBeNull();
    expect(sent.status).toBe("success");
  });

  it("clears the post when the message is unsent", async () => {
    const postId = await addPost("admin", 1);
    const sent = await traineeSends(postId);
    const messageId = sent.status === "success" ? sent.message.id : -1;
    const unsent = await user.unsendMessageAction({ messageId });

    expect(unsent.status === "success" && unsent.message.post).toBeNull();
    expect(await storedPostId(messageId)).toBeNull();
    expect(
      (await queries.findMessageById(messageId, superViewer))?.post,
    ).toBeNull();
  });
});

describe("canQuotePost and loadCoachReplyPostFor", () => {
  it("applies the same rules to the preview of a freshly opened chat", async () => {
    const adminPost = await addPost("admin", 1, "everyone", "Tin từ PT");
    const anPost = await addPost("user", anId);
    const boPost = await addPost("user", boId);

    expect(
      await replyPost.loadCoachReplyPostFor(anViewer(), adminPost, anId),
    ).toMatchObject({ id: adminPost, authorName: "pt1", caption: "Tin từ PT" });
    expect(
      await replyPost.loadCoachReplyPostFor(anViewer(), anPost, anId),
    ).toBeNull();
    expect(
      await replyPost.loadCoachReplyPostFor(superViewer, anPost, anId),
    ).toMatchObject({ id: anPost, authorName: "An" });
    expect(
      await replyPost.loadCoachReplyPostFor(superViewer, boPost, anId),
    ).toBeNull();
    expect(
      await replyPost.loadCoachReplyPostFor(superViewer, adminPost, anId),
    ).toBeNull();
    expect(
      await replyPost.loadCoachReplyPostFor(anViewer(), 9999, anId),
    ).toBeNull();
  });
});
