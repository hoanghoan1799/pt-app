import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  adminHiddenUsers,
  admins,
  pushSubscriptions,
  socialNotifications,
  socialPosts,
  users,
} from "@/db/schema";
import { TERMS_VERSION } from "@/features/social/constants/social";
import type { SocialActor } from "@/features/social/types/social";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as unknown,
  admin: null as unknown,
  reveal: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ default: { sendNotification: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (task: () => unknown) => void task() }));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn() }));
vi.mock("@/services/admin-lock", () => ({
  canSeeHiddenUsers: vi.fn(async () => state.reveal),
}));
vi.mock("@/services/auth-guard", () => ({
  requireUser: vi.fn(async () => state.user),
  requireAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const notify = await import("@/features/social/services/admin-post-notify");
const postMutations = await import("@/features/social/services/post-mutations");
const notifications =
  await import("@/features/social/services/social-notifications");
const push = await import("@/features/chat/services/chat-push");

type Sender = import("@/features/chat/services/chat-push").PushSender;

let db: TestDb;
let superId: number;
let ptA: number;
let ptB: number;
let alice: number; // PT A's trainee
let ann: number; // PT A's trainee, hidden by PT A in some tests
let bob: number; // PT B's trainee
let carol: number; // no PT

const asAdmin = (id: number, role: "super_admin" | "pt") =>
  ({ kind: "admin", id, role }) satisfies SocialActor;

const addAdmin = async (name: string, role: "pt" | "super_admin" | null) => {
  const [row] = await db
    .insert(admins)
    .values({ username: name, usernameKey: name, passwordHash: "x", role })
    .returning({ id: admins.id });

  return row.id;
};

const addUser = async (name: string, ptAdminId: number | null) => {
  const [row] = await db
    .insert(users)
    .values({ name, nameKey: name, ptAdminId, termsVersion: TERMS_VERSION })
    .returning({ id: users.id });

  return row.id;
};

const recipients = async () =>
  (await db.select().from(socialNotifications))
    .map((row) => row.recipientKey)
    .sort();

const keys = (...ids: number[]) => ids.map((id) => `user:${id}`).sort();

beforeEach(async () => {
  vi.restoreAllMocks();
  db = await createTestDb();
  state.db = db;
  state.reveal = false;
  superId = await addAdmin("root", null);
  ptA = await addAdmin("pta", "pt");
  ptB = await addAdmin("ptb", "pt");
  alice = await addUser("alice", ptA);
  ann = await addUser("ann", ptA);
  bob = await addUser("bob", ptB);
  carol = await addUser("carol", null);
  state.admin = null;
});

describe("admin post notifications", () => {
  const post = { postId: 1, privacy: "everyone" as const };

  it("tells a PT's own trainees, not other trainees or admins", async () => {
    const ids = await notify.createAdminPostNotifications(
      asAdmin(ptA, "pt"),
      post,
      { includeHidden: false },
    );

    expect(ids).toHaveLength(2);
    expect(await recipients()).toEqual(keys(alice, ann));
    const rows = await db.select().from(socialNotifications);

    expect(rows.every((row) => row.kind === "admin_post")).toBe(true);
    expect(rows.every((row) => row.actorKey === `admin:${ptA}`)).toBe(true);
    expect(rows.every((row) => row.postId === 1)).toBe(true);
    expect(rows.every((row) => row.readAt === null)).toBe(true);
  });

  it("tells every trainee for a super admin, and never an admin", async () => {
    await notify.createAdminPostNotifications(
      asAdmin(superId, "super_admin"),
      post,
      { includeHidden: false },
    );
    expect(await recipients()).toEqual(keys(alice, ann, bob, carol));
  });

  it("tells nobody about an only_me post", async () => {
    const ids = await notify.createAdminPostNotifications(
      asAdmin(superId, "super_admin"),
      { postId: 1, privacy: "only_me" },
      { includeHidden: false },
    );

    expect(ids).toEqual([]);
    expect(await recipients()).toEqual([]);
  });

  it("does nothing for a trainee's post", async () => {
    const ids = await notify.createAdminPostNotifications(
      { kind: "user", id: alice },
      post,
      { includeHidden: false },
    );

    expect(ids).toEqual([]);
    expect(await recipients()).toEqual([]);
  });

  it("skips trainees the author hid unless they revealed them", async () => {
    await db.insert(adminHiddenUsers).values({ adminId: ptA, userId: ann });
    // Hidden by someone else does not matter.
    await db.insert(adminHiddenUsers).values({ adminId: ptB, userId: alice });

    await notify.createAdminPostNotifications(asAdmin(ptA, "pt"), post, {
      includeHidden: false,
    });
    expect(await recipients()).toEqual(keys(alice));

    await db.delete(socialNotifications);
    await notify.createAdminPostNotifications(asAdmin(ptA, "pt"), post, {
      includeHidden: true,
    });
    expect(await recipients()).toEqual(keys(alice, ann));
  });

  it("notifyAdminPost reads the reveal state of the author", async () => {
    await db.insert(adminHiddenUsers).values({ adminId: superId, userId: bob });
    await notify.notifyAdminPost(asAdmin(superId, "super_admin"), post);
    expect(await recipients()).toEqual(keys(alice, ann, carol));

    state.reveal = true;
    await db.delete(socialNotifications);
    await notify.notifyAdminPost(asAdmin(superId, "super_admin"), post);
    expect(await recipients()).toEqual(keys(alice, ann, bob, carol));
  });

  it("inserts a large audience in batches", async () => {
    for (let i = 0; i < 230; i += 1) {
      await addUser(`extra${i}`, ptA);
    }
    const ids = await notify.createAdminPostNotifications(
      asAdmin(ptA, "pt"),
      post,
      { includeHidden: false },
    );

    expect(ids).toHaveLength(232);
    expect(new Set(ids).size).toBe(232);
    expect(await db.select().from(socialNotifications)).toHaveLength(232);
  });

  it("never fails the post when notifying breaks", async () => {
    state.db = {
      ...db,
      select: () => {
        throw new Error("boom");
      },
    };
    await expect(
      notify.notifyAdminPost(asAdmin(ptA, "pt"), post),
    ).resolves.toEqual([]);
  });

  it("removes the notifications when the post is deleted", async () => {
    const [row] = await db
      .insert(socialPosts)
      .values({
        authorKind: "admin",
        authorId: ptA,
        privacy: "everyone",
        caption: "hi",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: socialPosts.id });

    await notify.notifyAdminPost(asAdmin(ptA, "pt"), {
      postId: row.id,
      privacy: "everyone",
    });
    expect(await db.select().from(socialNotifications)).toHaveLength(2);
    await postMutations.deletePost(asAdmin(ptA, "pt"), row.id);
    expect(
      await db
        .select()
        .from(socialNotifications)
        .where(eq(socialNotifications.postId, row.id)),
    ).toHaveLength(0);
  });
});

describe("admin post push", () => {
  const sender = vi.fn<Sender>();
  let postId: number;

  const insertPost = async (caption: string | null) => {
    const [row] = await db
      .insert(socialPosts)
      .values({
        authorKind: "admin",
        authorId: ptA,
        privacy: "everyone",
        caption,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: socialPosts.id });

    return row.id;
  };

  const subscribe = (ownerKey: string) =>
    db.insert(pushSubscriptions).values({
      ownerKey,
      endpoint: `https://push.example/${ownerKey}`,
      p256dh: "p",
      auth: "a",
    });

  const notificationOf = async (userId: number) => {
    const [row] = await db
      .select()
      .from(socialNotifications)
      .where(eq(socialNotifications.recipientKey, `user:${userId}`));

    return row;
  };

  beforeEach(async () => {
    sender.mockReset();
    sender.mockResolvedValue(undefined);
    push.resetChatPushForTests();
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    vi.stubEnv("VAPID_SUBJECT", "mailto:pt@example.com");
    postId = await insertPost("Tập chân hôm nay");
    await subscribe(`user:${alice}`);
    await subscribe(`user:${bob}`);
  });

  it("pushes the caption preview to the PT's subscribed trainee only", async () => {
    await notify.createAdminPostNotifications(
      asAdmin(ptA, "pt"),
      { postId, privacy: "everyone" },
      { includeHidden: false },
    );
    for (const userId of [alice, ann]) {
      const row = await notificationOf(userId);

      await notifications.sendSocialPush({ notificationId: row.id }, sender);
    }
    // Bob is subscribed but PT B did not post; ann has no device.
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender.mock.calls[0][0].endpoint).toBe(
      `https://push.example/user:${alice}`,
    );
    expect(sender.mock.calls[0][1]).toMatchObject({
      title: "PT App",
      body: "pta vừa đăng bài mới: Tập chân hôm nay",
      url: `/post/${postId}`,
      tag: `social-post-${postId}`,
    });
    expect((await notificationOf(alice)).pushedAt).not.toBeNull();
  });

  it("says a new photo when the post has no caption", async () => {
    const photoPost = await insertPost(null);

    await notify.createAdminPostNotifications(
      asAdmin(ptA, "pt"),
      { postId: photoPost, privacy: "everyone" },
      { includeHidden: false },
    );
    const [row] = await db
      .select()
      .from(socialNotifications)
      .where(eq(socialNotifications.recipientKey, `user:${alice}`));

    await notifications.sendSocialPush({ notificationId: row.id }, sender);
    expect(sender.mock.calls[0][1].body).toBe("pta vừa đăng một ảnh mới");
  });

  it("sends nothing for a post deleted before the push", async () => {
    await notify.createAdminPostNotifications(
      asAdmin(ptA, "pt"),
      { postId, privacy: "everyone" },
      { includeHidden: false },
    );
    const row = await notificationOf(alice);

    await db
      .update(socialPosts)
      .set({ deletedAt: new Date() })
      .where(eq(socialPosts.id, postId));
    await notifications.sendSocialPush({ notificationId: row.id }, sender);
    expect(sender).not.toHaveBeenCalled();
  });

  it("lists the notification for the trainee", async () => {
    await notify.createAdminPostNotifications(
      asAdmin(ptA, "pt"),
      { postId, privacy: "everyone" },
      { includeHidden: false },
    );
    const list = await notifications.listNotifications(`user:${alice}`);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      kind: "admin_post",
      text: "pta vừa đăng bài mới",
      href: `/post/${postId}`,
      isUnread: true,
    });
  });
});
