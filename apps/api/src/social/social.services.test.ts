import { describe, expect, it, vi } from "vitest";

import type { Clock } from "../common/clock.js";
import { PostPolicy } from "./domain/post.policy.js";
import { SOCIAL_EVENTS } from "./events/social.events.js";
import type { SocialEventsPublisher } from "./events/social-events.publisher.js";
import { NotificationsListener } from "./notifications/notifications.listener.js";
import type { NotificationsService } from "./notifications/notifications.service.js";
import type { PostAccess, PostRow } from "./post-access.service.js";
import { PostsService } from "./posts.service.js";
import type { SocialActor } from "./social-actor.js";

const NOW = new Date("2026-11-12T10:00:00.000Z");
const clock = { now: () => NOW } as Clock;
const ann: SocialActor = { kind: "user", id: 1 };
const superAdmin: SocialActor = { kind: "admin", id: 9, role: "super_admin", revealed: false };

const post = (overrides: Partial<PostRow> = {}): PostRow => ({
  id: 7,
  authorKind: "user",
  authorId: 1,
  caption: "hi",
  privacy: "friends",
  photoId: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const build = (found: PostRow | null = post()) => {
  const query = vi.fn(async (): Promise<unknown> => []);
  const transaction = vi.fn(async (run: (m: unknown) => unknown) =>
    run({ query }),
  );
  const publish = vi.fn(async () => undefined);
  const service = new PostsService(
    { query, transaction } as never,
    new PostPolicy(),
    { findLivePost: vi.fn(async () => found) } as unknown as PostAccess,
    { publish } as unknown as SocialEventsPublisher,
    clock,
  );

  return { service, query, transaction, publish };
};

describe("PostsService", () => {
  it("refuses an empty post before touching the database", async () => {
    const { service, query } = build();

    await expect(
      service.create(ann, { caption: "  ", privacy: "friends", photoId: null }, null),
    ).rejects.toMatchObject({ response: { code: "EMPTY_POST" } });
    expect(query).not.toHaveBeenCalled();
  });

  it("returns the first post for a repeated Idempotency-Key and publishes nothing", async () => {
    const { service, query, transaction, publish } = build();

    query.mockResolvedValueOnce([{ id: 55 }]);
    await expect(
      service.create(ann, { caption: "hi", privacy: "friends", photoId: null }, "k1"),
    ).resolves.toEqual({ postId: 55, replayed: true });
    expect(transaction).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("falls back to the winner when two requests with one key race", async () => {
    const { service, query, transaction } = build();

    query.mockResolvedValueOnce([]);
    transaction.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
    query.mockResolvedValueOnce([{ id: 77 }]);
    await expect(
      service.create(ann, { caption: "hi", privacy: "friends", photoId: null }, "k2"),
    ).resolves.toEqual({ postId: 77, replayed: true });
  });

  it("publishes post.published after the insert, with the admin's reveal state", async () => {
    const { service, query, publish } = build();

    query.mockResolvedValueOnce([{ id: 12 }]);
    await expect(
      service.create(
        { kind: "admin", id: 9, role: "pt", revealed: true },
        { caption: "hi", privacy: "everyone", photoId: null },
        null,
      ),
    ).resolves.toEqual({ postId: 12, replayed: false });
    expect(publish).toHaveBeenCalledWith(SOCIAL_EVENTS.POST_PUBLISHED, {
      postId: 12,
      authorKind: "admin",
      authorId: 9,
      privacy: "everyone",
      includeHidden: true,
      at: NOW,
    });
  });

  it("lets only the author edit and rejects a missing post", async () => {
    const stranger: SocialActor = { kind: "user", id: 2 };

    await expect(
      build().service.edit(stranger, 7, { caption: "x", privacy: "friends" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      build().service.edit(superAdmin, 7, { caption: "x", privacy: "friends" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      build(null).service.edit(ann, 7, { caption: "x", privacy: "friends" }),
    ).rejects.toMatchObject({ status: 404, response: { code: "POST_NOT_FOUND" } });
    const { service, query } = build();

    await service.edit(ann, 7, { caption: " new ", privacy: "only_me" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE social_posts"), [
      7,
      "new",
      "only_me",
      NOW,
    ]);
  });

  it("refuses to clear the text of a post without a photo, but keeps a photo post", async () => {
    await expect(
      build().service.edit(ann, 7, { caption: " ", privacy: "friends" }),
    ).rejects.toMatchObject({ response: { code: "EMPTY_POST" } });
    const withPhoto = build(post({ photoId: 3 }));

    await withPhoto.service.edit(ann, 7, { caption: "", privacy: "friends" });
    expect(withPhoto.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE social_posts"),
      [7, null, "friends", NOW],
    );
  });

  it("lets the author or a super admin delete, in one transaction", async () => {
    const stranger: SocialActor = { kind: "user", id: 2 };

    await expect(build().service.delete(stranger, 7)).rejects.toMatchObject({ status: 403 });
    const { service, transaction, query } = build();

    await service.delete(superAdmin, 7);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(5);
    await expect(build(null).service.delete(ann, 7)).rejects.toMatchObject({ status: 404 });
  });
});

describe("NotificationsListener", () => {
  const build = () => {
    const notifications = {
      createFriend: vi.fn(async () => 1),
      upsertReaction: vi.fn(async () => 2),
      create: vi.fn(async () => 3),
      removeReaction: vi.fn(async () => undefined),
      removeFriend: vi.fn(async () => undefined),
      adminPostRecipientIds: vi.fn(async () => [4, 5]),
      createAdminPost: vi.fn(async () => [
        { id: 10, recipientKey: "user:4" },
        { id: 11, recipientKey: "user:5" },
      ]),
    };
    const publish = vi.fn<(event: string, payload: object) => Promise<void>>(
      async () => undefined,
    );
    const listener = new NotificationsListener(
      notifications as unknown as NotificationsService,
      { publish } as unknown as SocialEventsPublisher,
    );

    return { listener, notifications, publish };
  };

  it("does not notify for a reaction or comment on one's own post", async () => {
    const { listener, notifications, publish } = build();

    await listener.onPostReacted({
      postId: 1,
      reactorKey: "user:1",
      recipientKey: "user:1",
      emoji: "👍",
      at: NOW,
    });
    await listener.onPostCommented({
      postId: 1,
      commentId: 1,
      authorKey: "user:1",
      recipientKey: "user:1",
      body: "x",
      at: NOW,
    });
    expect(notifications.upsertReaction).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("creates the row and announces it, carrying the comment text only on the event", async () => {
    const { listener, notifications, publish } = build();

    await listener.onPostCommented({
      postId: 1,
      commentId: 5,
      authorKey: "user:2",
      recipientKey: "user:1",
      body: "nice",
      at: NOW,
    });
    expect(notifications.create).toHaveBeenCalledWith({
      recipientKey: "user:1",
      kind: "post_comment",
      actorKey: "user:2",
      postId: 1,
      at: NOW,
    });
    expect(publish).toHaveBeenCalledWith(SOCIAL_EVENTS.NOTIFICATION_CREATED, {
      notificationId: 3,
      kind: "post_comment",
      recipientKey: "user:1",
      actorKey: "user:2",
      postId: 1,
      commentBody: "nice",
      at: NOW,
    });
  });

  it("tells the audience of an admin post, one event per recipient, and nobody for the rest", async () => {
    const { listener, notifications, publish } = build();
    const event = {
      postId: 3,
      authorKind: "admin" as const,
      authorId: 9,
      privacy: "everyone" as const,
      includeHidden: false,
      at: NOW,
    };

    await listener.onPostPublished(event);
    expect(notifications.adminPostRecipientIds).toHaveBeenCalledWith(9, false);
    expect(publish.mock.calls.map(([, payload]) => (payload as { notificationId: number }).notificationId)).toEqual([10, 11]);

    notifications.createAdminPost.mockClear();
    await listener.onPostPublished({ ...event, privacy: "only_me" });
    await listener.onPostPublished({ ...event, authorKind: "user", authorId: 1 });
    expect(notifications.createAdminPost).not.toHaveBeenCalled();
  });

  it("clears friend notifications both ways on a block", async () => {
    const { listener, notifications } = build();

    await listener.onUserBlocked({ blockerId: 1, blockedId: 2 });
    expect(notifications.removeFriend).toHaveBeenNthCalledWith(1, "user:1", "user:2");
    expect(notifications.removeFriend).toHaveBeenNthCalledWith(2, "user:2", "user:1");
  });
});
