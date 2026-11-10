import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  admins,
  dmConversations,
  dmMessages,
  dmPhotos,
  dmReads,
  socialPostPhotos,
  socialPosts,
  users,
} from "@/db/schema";
import { DM_MESSAGES } from "@/features/social/constants/dm";
import { TERMS_VERSION } from "@/features/social/constants/social";
import type { SocialActor } from "@/features/social/types/social";
import { pairOf } from "@/features/social/utils/friend-rules";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as null | { id: number; termsVersion: number | null },
  admin: null as null | { id: number; role: "super_admin" | "pt" },
  // Sending is off for everyone since 2026-11-09. The tests that cover the
  // dormant send mechanics (old data, unsend, post quotes) turn it on here.
  sendOpen: true,
  publish: vi.fn(),
  push: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ default: { sendNotification: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn() }));
vi.mock("@/features/social/services/dm-notify", () => ({
  publishDmEvent: state.publish,
  scheduleDmPush: state.push,
}));
vi.mock("@/features/social/utils/dm-rules", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/social/utils/dm-rules")>();

  return {
    ...original,
    sendBlockReason: () =>
      state.sendOpen ? (null as unknown as string) : original.sendBlockReason(),
  };
});
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
  requireUser: vi.fn(async () => state.user),
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const friends = await import("@/features/social/services/friend-mutations");
const access = await import("@/features/social/services/dm-access");
const mutations = await import("@/features/social/services/dm-mutations");
const queries = await import("@/features/social/services/dm-queries");
const adminQueries =
  await import("@/features/social/services/dm-admin-queries");
const dmPhotosService = await import("@/features/social/services/dm-photos");
const actions = await import("@/features/social/services/dm-actions");
const cleanup = await import("@/features/social/services/post-cleanup");
const messagesRoute =
  await import("@/app/api/dm/[conversationId]/messages/route");
const photoRoute = await import("@/app/api/dm/photos/[id]/route");
const uploadRoute = await import("@/app/api/dm/photos/route");
const unreadRoute = await import("@/app/api/chat/unread/route");

let db: TestDb;
let superId: number;
let ptId: number;
let alice: number;
let bob: number;
let carol: number;
let seq = 0;

const member = (id: number) => ({ kind: "user", id }) satisfies SocialActor;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const addAdmin = async (name: string, role: "pt" | "super_admin" | null) => {
  const [row] = await db
    .insert(admins)
    .values({ username: name, usernameKey: name, passwordHash: "x", role })
    .returning({ id: admins.id });

  return row.id;
};

const addUser = async (name: string, terms = true) => {
  const [row] = await db
    .insert(users)
    .values({
      name,
      nameKey: name,
      termsVersion: terms ? TERMS_VERSION : null,
    })
    .returning({ id: users.id });

  return row.id;
};

const befriend = async (a: number, b: number) => {
  await friends.sendFriendRequest(a, b);
  await friends.acceptFriendRequest(b, a);
};

const signInAs = (id: number) => {
  state.user = { id, termsVersion: TERMS_VERSION };
  state.admin = null;
};

const signInAdmin = (id: number, role: "super_admin" | "pt") => {
  state.user = null;
  state.admin = { id, role };
};

const ascii = (text: string) => Array.from(text).map((c) => c.charCodeAt(0));
const be32 = (n: number) => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];

const png = (size = 64) => {
  const bytes = new Uint8Array(size);

  bytes.set([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...be32(13),
    ...ascii("IHDR"),
    ...be32(800),
    ...be32(600),
  ]);
  return bytes;
};

// Conversations can no longer be created through the app, so the tests seed an
// old one directly, as it exists in production data.
const openChat = async (a: number, b: number) => {
  const { low, high } = pairOf(a, b);
  const [row] = await db
    .insert(dmConversations)
    .values({ userLow: low, userHigh: high, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [dmConversations.userLow, dmConversations.userHigh],
      set: { userLow: low },
    })
    .returning({ id: dmConversations.id });

  return row.id;
};

const send = (
  conversationId: number,
  senderId: number,
  body: string,
  options: { photoId?: number | null; clientId?: string } = {},
) =>
  mutations.sendDmMessage({
    conversationId,
    senderId,
    body,
    photoId: options.photoId ?? null,
    clientId: options.clientId ?? uuid(),
  });

const uploadPhoto = (conversationId: number, uploaderId: number) =>
  dmPhotosService.createPendingDmPhoto({
    conversationId,
    uploaderId,
    mime: "image/png",
    width: 800,
    height: 600,
    bytes: png(),
  });

beforeEach(async () => {
  vi.clearAllMocks();
  state.sendOpen = true;
  db = await createTestDb();
  state.db = db;
  superId = await addAdmin("root", null);
  ptId = await addAdmin("pt", "pt");
  alice = await addUser("alice");
  bob = await addUser("bob");
  carol = await addUser("carol");
  signInAs(alice);
});

describe("opening a conversation", () => {
  it("never creates one, even between friends", async () => {
    await befriend(alice, bob);
    expect(await mutations.getOrCreateDmConversation(alice, bob)).toEqual({
      ok: false,
      error: "disabled",
      message: DM_MESSAGES.DISABLED,
    });
    expect(await db.select().from(dmConversations)).toHaveLength(0);
  });

  it("returns an existing conversation for either member", async () => {
    const first = await openChat(alice, bob);

    expect(await mutations.getOrCreateDmConversation(alice, bob)).toEqual({
      ok: true,
      conversationId: first,
    });
    expect(await mutations.getOrCreateDmConversation(bob, alice)).toEqual({
      ok: true,
      conversationId: first,
    });
    expect(await db.select().from(dmConversations)).toHaveLength(1);
  });

  it("refuses yourself, a blocked trainee and a member without terms", async () => {
    await befriend(alice, bob);
    await openChat(alice, bob);
    expect(await mutations.getOrCreateDmConversation(alice, alice)).toEqual({
      ok: false,
      error: "not_found",
    });
    await friends.blockUser(alice, bob);
    expect(await mutations.getOrCreateDmConversation(alice, bob)).toEqual({
      ok: false,
      error: "not_found",
    });
    await db
      .update(users)
      .set({ termsVersion: null })
      .where(eq(users.id, carol));
    expect(await mutations.getOrCreateDmConversation(carol, alice)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("who may open a conversation", () => {
  let id: number;

  beforeEach(async () => {
    await befriend(alice, bob);
    id = await openChat(alice, bob);
  });

  it("lets both members in, read-only now that trainee chat is off", async () => {
    state.sendOpen = false;
    for (const [viewer, other] of [
      [alice, bob],
      [bob, alice],
    ]) {
      const view = await access.resolveDmView(id, member(viewer));

      expect(view?.access).toBe("member");
      expect(view?.otherId).toBe(other);
      expect(view?.readOnlyReason).toBe(DM_MESSAGES.DISABLED);
    }
    expect(await send(id, alice, "hi")).toEqual({
      ok: false,
      error: "read_only",
      message: DM_MESSAGES.DISABLED,
    });
    expect(await db.select().from(dmMessages)).toHaveLength(0);
  });

  it("lets both members in, writable while the dormant send path is open", async () => {
    for (const [viewer, other] of [
      [alice, bob],
      [bob, alice],
    ]) {
      const view = await access.resolveDmView(id, member(viewer));

      expect(view?.access).toBe("member");
      expect(view?.otherId).toBe(other);
      expect(view?.readOnlyReason).toBeNull();
    }
  });

  it("hides it from other trainees", async () => {
    expect(await access.resolveDmView(id, member(carol))).toBeNull();
  });

  it("gives a super admin a read-only view and a PT nothing", async () => {
    const view = await access.resolveDmView(id, {
      kind: "admin",
      id: superId,
      role: "super_admin",
    });

    expect(view?.access).toBe("readonly_admin");
    expect(
      await access.resolveDmView(id, { kind: "admin", id: ptId, role: "pt" }),
    ).toBeNull();
  });

  it("turns read-only after an unfriend but keeps the history", async () => {
    await send(id, alice, "hello");
    state.sendOpen = false;
    await friends.unfriend(alice, bob);
    const view = await access.resolveDmView(id, member(bob));

    expect(view?.readOnlyReason).toBe(DM_MESSAGES.DISABLED);
    expect((await send(id, bob, "still there?")).ok).toBe(false);
    expect(
      (
        await queries.listDmThread(id, {
          otherId: alice,
          viewer: member(bob),
        })
      ).messages,
    ).toHaveLength(1);
  });

  it("hides it from both members after a block, still readable by a super admin", async () => {
    await send(id, alice, "hello");
    await friends.blockUser(bob, alice);

    expect(await access.resolveDmView(id, member(alice))).toBeNull();
    expect(await access.resolveDmView(id, member(bob))).toBeNull();
    expect(
      (
        await access.resolveDmView(id, {
          kind: "admin",
          id: superId,
          role: "super_admin",
        })
      )?.access,
    ).toBe("readonly_admin");
  });

  it("is read-only while the other side has not accepted the terms", async () => {
    state.sendOpen = false;
    await db.update(users).set({ termsVersion: null }).where(eq(users.id, bob));
    const view = await access.resolveDmView(id, member(alice));

    expect(view?.readOnlyReason).toBe(DM_MESSAGES.DISABLED);
    const result = await send(id, alice, "hi");

    expect(result.ok).toBe(false);
  });

  it("hides it from a member who has not accepted the terms", async () => {
    await db
      .update(users)
      .set({ termsVersion: null })
      .where(eq(users.id, alice));
    expect(await access.resolveDmView(id, member(alice))).toBeNull();
  });
});

describe("sending", () => {
  let id: number;

  beforeEach(async () => {
    await befriend(alice, bob);
    id = await openChat(alice, bob);
  });

  it("stores text, trims it and updates the conversation", async () => {
    const result = await send(id, alice, "  chào bạn  ");

    expect(result.ok && result.message.body).toBe("chào bạn");
    const [conversation] = await db.select().from(dmConversations);

    expect(conversation.lastMessageId).toBe(result.ok ? result.message.id : -1);
  });

  it("is idempotent by client id", async () => {
    const clientId = uuid();
    const first = await send(id, alice, "one", { clientId });
    const second = await send(id, alice, "one", { clientId });

    expect(first.ok && first.created).toBe(true);
    expect(second.ok && second.created).toBe(false);
    expect(second.ok && first.ok && second.message.id).toBe(
      first.ok ? first.message.id : -1,
    );
    expect(await db.select().from(dmMessages)).toHaveLength(1);
  });

  it("rejects empty and over-long text", async () => {
    expect(await send(id, alice, "   ")).toMatchObject({ error: "empty" });
    expect(await send(id, alice, "x".repeat(2001))).toMatchObject({
      error: "too_long",
    });
    expect((await send(id, alice, "x".repeat(2000))).ok).toBe(true);
  });

  it("refuses a sender who is not a member", async () => {
    expect(await send(id, carol, "hi")).toMatchObject({ error: "not_found" });
  });

  it("sends a photo only once, only for the uploader and the conversation", async () => {
    const photoId = await uploadPhoto(id, alice);

    expect(await send(id, bob, "mine", { photoId })).toMatchObject({
      error: "photo_not_found",
    });
    const sent = await send(id, alice, "", { photoId });

    expect(sent.ok && sent.message.photo?.url).toBe(
      `/api/dm/photos/${photoId}`,
    );
    expect(await send(id, alice, "", { photoId })).toMatchObject({
      error: "photo_not_found",
    });
    const [photo] = await db.select().from(dmPhotos);

    expect(photo.messageId).toBe(sent.ok ? sent.message.id : -1);
  });

  it("marks the sender's own message as read", async () => {
    const sent = await send(id, alice, "hi");
    const [read] = await db
      .select()
      .from(dmReads)
      .where(eq(dmReads.userId, alice));

    expect(read.lastReadMessageId).toBe(sent.ok ? sent.message.id : -1);
  });
});

describe("unsend", () => {
  it("removes the message and its photo bytes, own messages only", async () => {
    await befriend(alice, bob);
    const id = await openChat(alice, bob);
    const photoId = await uploadPhoto(id, alice);
    const sent = await send(id, alice, "look", { photoId });
    const messageId = sent.ok ? sent.message.id : -1;

    expect(await mutations.unsendDmMessage(id, messageId, bob)).toMatchObject({
      ok: false,
    });
    expect((await db.select().from(dmPhotos)).length).toBe(1);

    expect((await mutations.unsendDmMessage(id, messageId, alice)).ok).toBe(
      true,
    );
    expect(await db.select().from(dmPhotos)).toHaveLength(0);
    const [row] = await db.select().from(dmMessages);

    expect(row.deletedAt).not.toBeNull();
    expect(row.body).toBeNull();
    // A second unsend finds nothing to take back.
    expect((await mutations.unsendDmMessage(id, messageId, alice)).ok).toBe(
      false,
    );
    const thread = await queries.listDmThread(id, {
      otherId: bob,
      viewer: member(alice),
    });

    expect(thread.messages).toHaveLength(0);
    expect(thread.deletedIds).toEqual([messageId]);
  });
});

describe("threads, unread and the inbox", () => {
  it("pages and polls with cursors", async () => {
    await befriend(alice, bob);
    const id = await openChat(alice, bob);
    const ids: number[] = [];

    for (let i = 0; i < 3; i += 1) {
      const sent = await send(id, alice, `m${i}`);

      ids.push(sent.ok ? sent.message.id : -1);
    }
    const after = await queries.listDmThread(id, {
      after: ids[0],
      otherId: bob,
      viewer: member(alice),
    });

    expect(after.messages.map((m) => m.id)).toEqual([ids[1], ids[2]]);
    const before = await queries.listDmThread(id, {
      before: ids[2],
      otherId: bob,
      viewer: member(alice),
    });

    expect(before.messages.map((m) => m.id)).toEqual([ids[0], ids[1]]);
  });

  it("counts unread per member and clears it on read", async () => {
    await befriend(alice, bob);
    await befriend(alice, carol);
    const withBob = await openChat(alice, bob);
    const withCarol = await openChat(carol, alice);

    await send(withBob, bob, "1");
    await send(withBob, bob, "2");
    await send(withCarol, carol, "3");
    expect(await queries.countDmUnread(alice)).toBe(3);
    expect(await queries.countDmUnread(bob)).toBe(0);

    await mutations.markDmConversationRead(withBob, alice);
    expect(await queries.countDmUnread(alice)).toBe(1);
    // Read marks never move backwards.
    await mutations.markDmRead(withBob, alice, 1);
    expect(await queries.countDmUnread(alice)).toBe(1);

    const inbox = await queries.listDmInbox(alice);

    expect(inbox.map((row) => row.name)).toEqual(["carol", "bob"]);
    expect(inbox[0]).toMatchObject({ unread: 1, preview: "3" });
    expect(inbox[1]).toMatchObject({ unread: 0, preview: "2" });
  });

  it("previews a photo and leaves a block-hidden chat out", async () => {
    await befriend(alice, bob);
    const id = await openChat(alice, bob);
    const photoId = await uploadPhoto(id, bob);

    await send(id, bob, "", { photoId });
    expect((await queries.listDmInbox(alice))[0].preview).toBe("📷 Ảnh");
    await friends.blockUser(alice, bob);
    expect(await queries.listDmInbox(alice)).toEqual([]);
    expect(await queries.countDmUnread(alice)).toBe(0);
    expect(await queries.listDmConversationIds(alice)).toEqual([]);
  });
});

describe("GET /api/dm/[conversationId]/messages", () => {
  let id: number;
  const get = (conversationId: string | number, query = "") =>
    messagesRoute.GET(
      new NextRequest(
        `http://localhost/api/dm/${conversationId}/messages${query}`,
      ),
      { params: Promise.resolve({ conversationId: String(conversationId) }) },
    );

  beforeEach(async () => {
    await befriend(alice, bob);
    id = await openChat(alice, bob);
    await send(id, bob, "hello");
  });

  it("answers 401 without a session and 404 for strangers and bad ids", async () => {
    state.user = null;
    expect((await get(id)).status).toBe(401);
    signInAs(carol);
    expect((await get(id)).status).toBe(404);
    signInAs(alice);
    expect((await get("abc")).status).toBe(404);
    expect((await get(9999)).status).toBe(404);
    expect((await get(id, "?after=1&before=2")).status).toBe(400);
  });

  it("serves a member without caching", async () => {
    const response = await get(id);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.messages.map((m: { body: string }) => m.body)).toEqual([
      "hello",
    ]);
    expect(body.isReadOnly).toBe(false);
  });

  it("reports read-only after an unfriend", async () => {
    state.sendOpen = false;
    await friends.unfriend(alice, bob);
    const body = await (await get(id)).json();

    expect(body.isReadOnly).toBe(true);
    expect(body.readOnlyReason).toBe(DM_MESSAGES.DISABLED);
  });

  it("serves a super admin on ?as=admin, never a PT", async () => {
    signInAdmin(superId, "super_admin");
    const ok = await get(id, "?as=admin");

    expect(ok.status).toBe(200);
    expect((await ok.json()).isReadOnly).toBe(true);
    signInAdmin(ptId, "pt");
    expect((await get(id, "?as=admin")).status).toBe(404);
  });
});

describe("photo routes", () => {
  let id: number;
  let photoId: number;
  const getPhoto = (target: number | string) =>
    photoRoute.GET(
      new NextRequest(`http://localhost/api/dm/photos/${target}`),
      {
        params: Promise.resolve({ id: String(target) }),
      },
    );

  beforeEach(async () => {
    await befriend(alice, bob);
    id = await openChat(alice, bob);
    photoId = await uploadPhoto(id, alice);
  });

  it("serves nothing while the photo is pending", async () => {
    expect((await getPhoto(photoId)).status).toBe(404);
  });

  it("serves the members and a super admin, 404 for everyone else", async () => {
    await send(id, alice, "", { photoId });
    signInAs(bob);
    const ok = await getPhoto(photoId);

    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("image/png");
    expect(ok.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    signInAs(carol);
    expect((await getPhoto(photoId)).status).toBe(404);
    signInAdmin(ptId, "pt");
    expect((await getPhoto(photoId)).status).toBe(404);
    signInAdmin(superId, "super_admin");
    expect((await getPhoto(photoId)).status).toBe(200);
    state.admin = null;
    state.user = null;
    expect((await getPhoto(photoId)).status).toBe(401);
    expect((await getPhoto("nope")).status).toBe(404);
  });

  it("hides the photo from the members after a block and after an unsend", async () => {
    const sent = await send(id, alice, "", { photoId });

    await friends.blockUser(bob, alice);
    signInAs(alice);
    expect((await getPhoto(photoId)).status).toBe(404);
    await friends.unblockUser(bob, alice);
    expect((await getPhoto(photoId)).status).toBe(200);
    await mutations.unsendDmMessage(id, sent.ok ? sent.message.id : -1, alice);
    expect((await getPhoto(photoId)).status).toBe(404);
  });

  describe("upload", () => {
    const upload = (
      conversationId: number | string,
      body: Uint8Array = png(),
    ) =>
      uploadRoute.POST(
        new NextRequest(
          `http://localhost/api/dm/photos?conversationId=${conversationId}`,
          { method: "POST", body: body as BodyInit },
        ),
      );

    it("takes a PNG from a member", async () => {
      const response = await upload(id);

      expect(response.status).toBe(201);
      expect((await db.select().from(dmPhotos)).length).toBe(2);
    });

    it("refuses strangers, anonymous callers, junk and read-only chats", async () => {
      signInAs(carol);
      expect((await upload(id)).status).toBe(404);
      state.user = null;
      expect((await upload(id)).status).toBe(401);
      signInAs(alice);
      expect((await upload(id, new Uint8Array([1, 2, 3, 4]))).status).toBe(400);
      expect((await upload(id, new Uint8Array(401 * 1024))).status).toBe(413);
      expect((await upload("x")).status).toBe(404);
      state.sendOpen = false;
      expect((await upload(id)).status).toBe(403);
    });

    it("refuses a cross-site request", async () => {
      const response = await uploadRoute.POST(
        new NextRequest(`http://localhost/api/dm/photos?conversationId=${id}`, {
          method: "POST",
          body: png() as BodyInit,
          headers: { origin: "http://evil.example" },
        }),
      );

      expect(response.status).toBe(403);
    });
  });
});

describe("actions", () => {
  it("send publishes and pushes once, a retry does neither", async () => {
    await befriend(alice, bob);
    const id = await openChat(alice, bob);
    const input = {
      conversationId: id,
      clientId: uuid(),
      body: "hi",
      photoId: null,
    };

    expect((await actions.sendDmAction(input)).status).toBe("success");
    expect((await actions.sendDmAction(input)).status).toBe("success");
    expect(state.publish).toHaveBeenCalledTimes(1);
    expect(state.push).toHaveBeenCalledTimes(1);
    expect(state.push.mock.calls[0][0]).toMatchObject({
      senderId: alice,
      recipientId: bob,
      photo: false,
    });
  });

  it("answers an error for a stranger, bad input and a missing terms acceptance", async () => {
    await befriend(alice, bob);
    const id = await openChat(alice, bob);

    signInAs(carol);
    expect(
      (
        await actions.sendDmAction({
          conversationId: id,
          clientId: uuid(),
          body: "x",
        })
      ).status,
    ).toBe("error");
    signInAs(alice);
    expect((await actions.sendDmAction({ conversationId: "x" })).status).toBe(
      "error",
    );
    state.user = { id: alice, termsVersion: null };
    expect((await actions.openDmAction(bob)).status).toBe("error");
  });

  it("opens an existing conversation but never creates one", async () => {
    await befriend(alice, bob);
    expect(await actions.openDmAction(bob)).toEqual({
      status: "error",
      message: DM_MESSAGES.DISABLED,
    });
    const id = await openChat(alice, bob);

    expect(await actions.openDmAction(bob)).toEqual({
      status: "success",
      conversationId: id,
    });
  });

  it("marks read only for members", async () => {
    await befriend(alice, bob);
    const id = await openChat(alice, bob);

    await send(id, bob, "hi");
    signInAs(carol);
    expect((await actions.markDmReadAction(id)).status).toBe("error");
    signInAs(alice);
    expect((await actions.markDmReadAction(id)).status).toBe("success");
    expect(await queries.countDmUnread(alice)).toBe(0);
  });
});

describe("unread badge route", () => {
  it("adds friend chats to the count", async () => {
    await befriend(alice, bob);
    const id = await openChat(alice, bob);

    await send(id, bob, "hi");
    const response = await unreadRoute.GET(
      new NextRequest("http://localhost/api/chat/unread"),
    );
    const body = await response.json();

    expect(body.dmCount).toBe(1);
    expect(body.count).toBe(body.coachCount + 1);
  });
});

describe("admin listing", () => {
  it("lists every conversation with both names, newest first", async () => {
    await befriend(alice, bob);
    await befriend(alice, carol);
    const first = await openChat(alice, bob);
    const second = await openChat(alice, carol);

    await send(first, alice, "older", {});
    await new Promise((resolve) => setTimeout(resolve, 5));
    await send(second, carol, "newer");
    const rows = await adminQueries.listAllDmConversations();

    expect(rows.map((row) => [row.lowName, row.highName, row.preview])).toEqual(
      [
        ["alice", "carol", "newer"],
        ["alice", "bob", "older"],
      ],
    );
  });
});

describe("member delete", () => {
  it("removes the trainee's conversations, messages, photos and reads only", async () => {
    await befriend(alice, bob);
    await befriend(bob, carol);
    const withAlice = await openChat(alice, bob);
    const withCarol = await openChat(bob, carol);
    const photoId = await uploadPhoto(withAlice, alice);

    await send(withAlice, alice, "gone", { photoId });
    await send(withCarol, bob, "stays");
    await uploadPhoto(withAlice, bob);

    await db.transaction(async (tx) => {
      await cleanup.deleteSocialContentOfUser(tx as unknown as TestDb, alice);
    });

    expect(await db.select().from(dmConversations)).toHaveLength(1);
    const messages = await db.select().from(dmMessages);

    expect(messages.map((m) => m.body)).toEqual(["stays"]);
    expect(await db.select().from(dmPhotos)).toHaveLength(0);
    expect(
      (await db.select().from(dmReads)).every(
        (r) => r.conversationId === withCarol,
      ),
    ).toBe(true);
  });
});

describe("replying to a post", () => {
  let id: number;

  const addPost = async (
    authorId: number,
    privacy: "everyone" | "friends" | "only_me",
    caption: string | null = "Leg day done",
    authorKind: "user" | "admin" = "user",
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

  const reply = (senderId: number, postId: number, body = "Nice!") =>
    mutations.sendDmMessage({
      conversationId: id,
      senderId,
      body,
      photoId: null,
      postId,
      clientId: uuid(),
    });

  beforeEach(async () => {
    await befriend(alice, bob);
    id = await openChat(alice, bob);
  });

  it("stores the post id and returns the preview for the sender", async () => {
    const postId = await addPost(bob, "friends");
    const sent = await reply(alice, postId);

    expect(sent.ok && sent.message.post).toEqual({
      id: postId,
      available: true,
      authorName: "bob",
      authorAvatarUrl: null,
      caption: "Leg day done",
      photo: null,
    });
    const [row] = await db.select().from(dmMessages);

    expect(row.replyPostId).toBe(postId);
    // The recipient sees the same preview in the thread.
    const thread = await queries.listDmThread(id, {
      otherId: alice,
      viewer: member(bob),
    });

    expect(thread.messages[0].post).toMatchObject({
      id: postId,
      available: true,
      authorName: "bob",
    });
  });

  it("returns the full caption and the photo size", async () => {
    const long = `${"a".repeat(200)}\nline two`;
    const postId = await addPost(bob, "friends", long);
    const [photo] = await db
      .insert(socialPostPhotos)
      .values({
        uploaderKey: `user:${bob}`,
        postId,
        mime: "image/png",
        width: 800,
        height: 600,
        data: Buffer.from(png()),
        size: 64,
        createdAt: new Date(),
      })
      .returning({ id: socialPostPhotos.id });

    await db
      .update(socialPosts)
      .set({ photoId: photo.id })
      .where(eq(socialPosts.id, postId));
    const sent = await reply(alice, postId);

    expect(sent.ok && sent.message.post).toMatchObject({
      available: true,
      caption: long,
      photo: {
        url: `/api/social/photos/${photo.id}`,
        width: 800,
        height: 600,
      },
    });
  });

  it("rejects a post the sender cannot see", async () => {
    const postId = await addPost(bob, "only_me");
    const sent = await reply(alice, postId);

    expect(sent).toMatchObject({ ok: false, error: "post_not_found" });
    expect(await db.select().from(dmMessages)).toHaveLength(0);
  });

  it("rejects a post written by someone else than the other member", async () => {
    await befriend(alice, carol);
    const carolPost = await addPost(carol, "friends");
    const ownPost = await addPost(alice, "friends");
    const adminPost = await addPost(ptId, "everyone", "hi", "admin");

    for (const postId of [carolPost, ownPost, adminPost]) {
      expect(await reply(alice, postId)).toMatchObject({
        ok: false,
        error: "post_not_found",
      });
    }
  });

  it("rejects a deleted or unknown post", async () => {
    const postId = await addPost(bob, "friends");

    await db.update(socialPosts).set({ deletedAt: new Date() });

    expect(await reply(alice, postId)).toMatchObject({
      ok: false,
      error: "post_not_found",
    });
    expect(await reply(alice, 9999)).toMatchObject({
      ok: false,
      error: "post_not_found",
    });
  });

  it("needs a text with the post", async () => {
    const postId = await addPost(bob, "friends");

    expect(await reply(alice, postId, "   ")).toMatchObject({
      ok: false,
      error: "empty",
    });
  });

  it("shows a placeholder once the author makes the post private", async () => {
    const postId = await addPost(bob, "friends");

    await reply(alice, postId);
    await db.update(socialPosts).set({ privacy: "only_me" });
    const forAlice = await queries.listDmThread(id, {
      otherId: bob,
      viewer: member(alice),
    });
    const forBob = await queries.listDmThread(id, {
      otherId: alice,
      viewer: member(bob),
    });

    expect(forAlice.messages[0].post).toEqual({ id: postId, available: false });
    // The author still sees their own post.
    expect(forBob.messages[0].post).toMatchObject({
      id: postId,
      available: true,
    });
  });

  it("shows a placeholder after the post is deleted", async () => {
    const postId = await addPost(bob, "friends");

    await reply(alice, postId);
    await db.update(socialPosts).set({ deletedAt: new Date() });
    const thread = await queries.listDmThread(id, {
      otherId: bob,
      viewer: member(alice),
    });

    expect(thread.messages[0].post).toEqual({ id: postId, available: false });
  });

  it("is checked for the super admin too", async () => {
    const postId = await addPost(bob, "friends");

    await reply(alice, postId);
    const thread = await queries.listDmThread(id, {
      otherId: null,
      viewer: { kind: "admin", id: superId, role: "super_admin" },
    });

    expect(thread.messages[0].post?.id).toBe(postId);
  });

  it("clears the post on unsend", async () => {
    const postId = await addPost(bob, "friends");
    const sent = await reply(alice, postId);

    expect(
      (
        await mutations.unsendDmMessage(
          id,
          sent.ok ? sent.message.id : -1,
          alice,
        )
      ).ok,
    ).toBe(true);
    const [row] = await db.select().from(dmMessages);

    expect(row.replyPostId).toBeNull();
  });

  it("keeps a retried send idempotent", async () => {
    const postId = await addPost(bob, "friends");
    const clientId = uuid();
    const input = {
      conversationId: id,
      senderId: alice,
      body: "Nice!",
      photoId: null,
      postId,
      clientId,
    };
    const first = await mutations.sendDmMessage(input);
    const second = await mutations.sendDmMessage(input);

    expect(first.ok && first.created).toBe(true);
    expect(second.ok && second.created).toBe(false);
    expect(await db.select().from(dmMessages)).toHaveLength(1);
  });
});
