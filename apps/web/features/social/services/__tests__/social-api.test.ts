import { beforeEach, describe, expect, it, vi } from "vitest";

// The social area talks to the API only. These tests fake the API client (the
// real callApi / guards / actions / mappers run) and check which endpoint each
// action calls with what, and what a page gets back. The rules themselves
// (visibility, blocks, terms, limits) live in the API:
//   apps/api/test/social-posts.e2e.test.ts, social-engagement.e2e.test.ts,
//   social-friends.e2e.test.ts and src/social/social.services.test.ts.

type Answer = { status: number; body?: unknown };

const state = vi.hoisted(() => ({
  role: "user" as "user" | "admin",
  answers: [] as { method: string; path: string; answer: Answer }[],
  calls: [] as {
    actor: string;
    method: string;
    path: string;
    options: Record<string, unknown> | undefined;
    idempotencyKey: string | undefined;
  }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn(() => ({})) }));
vi.mock("@/services/api/me", async () => {
  const { fakeAdminMe, fakeUserMe } = await import("@/services/api/testing");

  return {
    fetchMe: vi.fn(async (role: string) =>
      role !== state.role
        ? null
        : role === "admin"
          ? fakeAdminMe({ id: 1 })
          : fakeUserMe({ id: 1 }),
    ),
  };
});
vi.mock("@/services/users", () => ({
  findUserById: vi.fn(async () => null),
  emptyUserRow: vi.fn(() => ({})),
}));
vi.mock("@/services/admins", () => ({
  findAdminById: vi.fn(async () => null),
}));
vi.mock("@/services/api/client", () => ({
  apiClient: vi.fn(
    async (actor: string, clientOptions: { idempotencyKey?: string } = {}) => {
      const make =
        (method: string) =>
        async (path: string, options?: Record<string, unknown>) => {
          state.calls.push({
            actor,
            method,
            path,
            options,
            idempotencyKey: clientOptions.idempotencyKey,
          });
          const index = state.answers.findIndex(
            (item) => item.method === method && item.path === path,
          );
          const { status, body } =
            index >= 0
              ? state.answers.splice(index, 1)[0].answer
              : {
                  status: 204,
                  body: undefined,
                };
          const response = {
            ok: status >= 200 && status < 300,
            status,
            url: `http://api.test${path}`,
          };

          return status >= 400
            ? { error: body, response }
            : { data: body, response };
        };

      return {
        GET: make("GET"),
        POST: make("POST"),
        PUT: make("PUT"),
        PATCH: make("PATCH"),
        DELETE: make("DELETE"),
      };
    },
  ),
}));

const answer = (method: string, path: string, status: number, body?: unknown) =>
  state.answers.push({ method, path, answer: { status, body } });

const reactions = { counts: [], total: 0, mine: null };
const apiPost = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  authorKind: "user",
  authorId: 7,
  authorName: "Lan",
  authorAvatarUrl: null,
  authorVerified: false,
  caption: `post ${id}`,
  privacy: "friends",
  photo: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  edited: false,
  canEdit: true,
  canDelete: true,
  reactions,
  commentCount: 0,
  ...overrides,
});

const social = await import("@/features/social/services/social-actions");
const engagement =
  await import("@/features/social/services/engagement-actions");
const friends = await import("@/features/social/services/friend-actions");
const queries = await import("@/features/social/services/social-queries");

const lastCall = () => state.calls[state.calls.length - 1];

beforeEach(() => {
  state.role = "user";
  state.answers.length = 0;
  state.calls.length = 0;
});

describe("posts", () => {
  it("creates a post with the Idempotency-Key of the submit", async () => {
    answer("POST", "/v1/social/posts", 201, { post: apiPost(1) });

    const result = await social.createPostAction(
      "user",
      { caption: "hi", privacy: "friends", photoId: 5 },
      "key-1",
    );

    expect(result.status).toBe("success");
    expect(lastCall()).toMatchObject({
      actor: "user",
      method: "POST",
      path: "/v1/social/posts",
      idempotencyKey: "key-1",
    });
    expect(lastCall().options).toMatchObject({
      body: { caption: "hi", privacy: "friends", photoId: 5 },
    });
  });

  it("posts as the admin session for an admin", async () => {
    state.role = "admin";
    answer("POST", "/v1/social/posts", 201, { post: apiPost(1) });

    await social.createPostAction(
      "admin",
      { caption: "news", privacy: "everyone", photoId: null },
      "key-2",
    );

    expect(lastCall().actor).toBe("admin");
  });

  it("rejects a bad privacy or a long caption before calling the API", async () => {
    const bad = await social.createPostAction(
      "user",
      { caption: "x", privacy: "public", photoId: null },
      "k",
    );
    const long = await social.createPostAction(
      "user",
      { caption: "a".repeat(2001), privacy: "friends", photoId: null },
      "k",
    );

    expect(bad.status).toBe("error");
    expect(long.status).toBe("error");
    expect(state.calls).toHaveLength(0);
  });

  it("shows the API's own message when it refuses (empty post, terms)", async () => {
    answer("POST", "/v1/social/posts", 400, {
      code: "EMPTY_POST",
      message: "Hãy viết nội dung hoặc chọn một ảnh.",
      ref: "r1",
    });

    const empty = await social.createPostAction(
      "user",
      { caption: "", privacy: "friends", photoId: null },
      "k",
    );

    expect(empty).toMatchObject({
      status: "error",
      message: "Hãy viết nội dung hoặc chọn một ảnh.",
      reference: "r1",
    });

    answer("POST", "/v1/social/posts", 403, {
      code: "TERMS_REQUIRED",
      message:
        "Bạn cần đồng ý Điều khoản sử dụng trước khi dùng tính năng này.",
    });
    const terms = await social.createPostAction(
      "user",
      { caption: "hi", privacy: "friends", photoId: null },
      "k",
    );

    expect(terms.status).toBe("error");
  });

  it("edits and deletes through the post endpoints", async () => {
    await social.editPostAction("user", {
      postId: 4,
      caption: "new",
      privacy: "only_me",
    });
    expect(lastCall()).toMatchObject({ method: "PATCH" });
    expect(lastCall().options).toMatchObject({
      params: { path: { id: "4" } },
      body: { caption: "new", privacy: "only_me" },
    });

    await social.deletePostAction("user", 4);
    expect(lastCall()).toMatchObject({
      method: "DELETE",
      path: "/v1/social/posts/{id}",
    });
  });

  it("saves the bio through PUT /v1/me/bio and limits it", async () => {
    await social.updateBioAction("user", "  hello  ");
    expect(lastCall()).toMatchObject({ method: "PUT", path: "/v1/me/bio" });
    expect(lastCall().options).toMatchObject({ body: { bio: "hello" } });

    state.calls.length = 0;
    const tooLong = await social.updateBioAction("user", "a".repeat(151));

    expect(tooLong.status).toBe("error");
    expect(state.calls).toHaveLength(0);
  });

  it("accepts the terms for the trainee", async () => {
    await social.acceptTermsAction();
    expect(lastCall()).toMatchObject({
      actor: "user",
      method: "POST",
      path: "/v1/social/me/terms",
    });
  });
});

describe("paging", () => {
  it("loads the next feed page with the API's cursor and maps the posts", async () => {
    answer("GET", "/v1/social/feed", 200, {
      items: [
        apiPost(9, {
          photo: { id: 3, url: "/v1/social/photos/3", width: 4, height: 5 },
          authorAvatarUrl: "/v1/avatars/user/7?v=12",
        }),
      ],
      nextCursor: "c2",
    });

    const result = await social.loadMorePostsAction(
      "user",
      { type: "feed" },
      "c1",
    );

    expect(result.status).toBe("success");
    expect(lastCall().options).toMatchObject({
      params: { query: { cursor: "c1" } },
    });
    if (result.status !== "success") {
      return;
    }
    expect(result.page.nextCursor).toBe("c2");
    expect(result.page.posts[0]).toMatchObject({
      id: 9,
      createdAt: Date.parse("2026-11-01T10:00:00.000Z"),
      photo: { id: 3, url: "/api/social/photos/3" },
      authorAvatarUrl: "/api/avatar/user/7?v=12",
    });
  });

  it("pages a profile by its key, for an admin too", async () => {
    state.role = "admin";
    answer("GET", "/v1/social/profiles/{key}/posts", 200, {
      items: [],
      nextCursor: null,
    });

    await social.loadMorePostsAction(
      "admin",
      { type: "profile", kind: "admin", id: 3 },
      "c1",
    );

    expect(lastCall().actor).toBe("admin");
    expect(lastCall().options).toMatchObject({
      params: { path: { key: "admin:3" }, query: { cursor: "c1" } },
    });
  });

  it("refuses a missing cursor", async () => {
    const result = await social.loadMorePostsAction(
      "user",
      { type: "feed" },
      42,
    );

    expect(result.status).toBe("error");
    expect(state.calls).toHaveLength(0);
  });
});

describe("reactions and comments", () => {
  it("sets a reaction with PUT and removes it with DELETE", async () => {
    await engagement.reactAction("user", { postId: 2, emoji: "💪" });
    expect(lastCall()).toMatchObject({
      method: "PUT",
      path: "/v1/social/posts/{id}/reaction",
    });
    expect(lastCall().options).toMatchObject({ body: { emoji: "💪" } });

    await engagement.reactAction("user", { postId: 2, emoji: null });
    expect(lastCall()).toMatchObject({
      method: "DELETE",
      path: "/v1/social/posts/{id}/reaction",
    });
  });

  it("refuses an emoji outside the six", async () => {
    const result = await engagement.reactAction("user", {
      postId: 2,
      emoji: "🙂",
    });

    expect(result.status).toBe("error");
    expect(state.calls).toHaveLength(0);
  });

  it("adds, edits and deletes comments; rejects an empty body", async () => {
    await engagement.addCommentAction("user", { postId: 2, body: " nice " });
    expect(lastCall().options).toMatchObject({ body: { body: "nice" } });
    await engagement.editCommentAction("user", { commentId: 8, body: "ok" });
    expect(lastCall()).toMatchObject({
      method: "PATCH",
      path: "/v1/social/comments/{id}",
    });
    await engagement.deleteCommentAction("user", 8);
    expect(lastCall().method).toBe("DELETE");

    state.calls.length = 0;
    const empty = await engagement.addCommentAction("user", {
      postId: 2,
      body: "   ",
    });

    expect(empty.status).toBe("error");
    expect(state.calls).toHaveLength(0);
  });

  it("lists reactors", async () => {
    answer("GET", "/v1/social/posts/{id}/reactions", 200, {
      items: [{ name: "Lan", emoji: "💪", isMe: true }],
    });

    expect(await engagement.listReactorsAction("user", 2)).toEqual({
      status: "success",
      reactors: [{ name: "Lan", emoji: "💪", isMe: true }],
    });
  });
});

describe("friends and reports", () => {
  it("sends, accepts, declines, cancels, unfriends, blocks and unblocks", async () => {
    const cases = [
      [friends.sendFriendRequestAction, "POST", "/v1/social/friends/requests"],
      [
        friends.acceptFriendRequestAction,
        "POST",
        "/v1/social/friends/requests/{userId}/accept",
      ],
      [
        friends.declineFriendRequestAction,
        "POST",
        "/v1/social/friends/requests/{userId}/decline",
      ],
      [
        friends.cancelFriendRequestAction,
        "DELETE",
        "/v1/social/friends/requests/{userId}",
      ],
      [friends.unfriendAction, "DELETE", "/v1/social/friends/{userId}"],
      [friends.blockUserAction, "PUT", "/v1/social/blocks/{userId}"],
      [friends.unblockUserAction, "DELETE", "/v1/social/blocks/{userId}"],
    ] as const;

    for (const [action, method, path] of cases) {
      expect((await action(12)).status).toBe("success");
      expect(lastCall()).toMatchObject({ actor: "user", method, path });
    }
  });

  it("shows the API's friend errors", async () => {
    answer("POST", "/v1/social/friends/requests", 409, {
      code: "ALREADY_REQUESTED",
      message: "Bạn đã gửi lời mời cho người này.",
    });

    expect(await friends.sendFriendRequestAction(12)).toMatchObject({
      status: "error",
      message: "Bạn đã gửi lời mời cho người này.",
    });
  });

  it("turns away a half-typed email before the API, finds a full one", async () => {
    expect((await friends.searchFriendAction("ann@")).status).toBe("error");
    expect(state.calls).toHaveLength(0);

    answer("GET", "/v1/social/people", 200, {
      result: {
        id: 5,
        name: "Ann",
        avatarUrl: "/v1/avatars/user/5?v=1",
        relationship: "none",
      },
    });
    expect(await friends.searchFriendAction(" Ann@Example.com ")).toEqual({
      status: "success",
      result: {
        id: 5,
        name: "Ann",
        avatarUrl: "/api/avatar/user/5?v=1",
        relationship: "none",
      },
    });
    expect(lastCall().options).toMatchObject({
      params: { query: { email: "ann@example.com" } },
    });
  });

  it("reports with an optional reason as trainee or admin", async () => {
    await friends.reportAction("user", {
      targetKind: "post",
      targetId: 3,
      reason: "spam",
    });
    expect(lastCall().options).toMatchObject({
      body: { targetKind: "post", targetId: 3, reason: "spam" },
    });

    state.role = "admin";
    await friends.reportAction("admin", { targetKind: "user", targetId: 3 });
    expect(lastCall()).toMatchObject({ actor: "admin" });
    expect((lastCall().options as { body: object }).body).not.toHaveProperty(
      "reason",
    );
  });

  it("lets only a super admin resolve; the API says keep or delete", async () => {
    state.role = "admin";
    await friends.resolveReportAction({ reportId: 4, resolution: "deleted" });
    expect(lastCall()).toMatchObject({
      actor: "admin",
      method: "POST",
      path: "/v1/social/reports/{id}/resolve",
    });
    expect(lastCall().options).toMatchObject({
      body: { resolution: "deleted" },
    });

    state.calls.length = 0;
    expect(
      (await friends.resolveReportAction({ reportId: 4, resolution: "x" }))
        .status,
    ).toBe("error");
    expect(state.calls).toHaveLength(0);
  });
});

describe("page reads", () => {
  it("returns null for a hidden post and profile (404)", async () => {
    answer("GET", "/v1/social/posts/{id}", 404, { code: "POST_NOT_FOUND" });
    answer("GET", "/v1/social/profiles/{key}", 404, {
      code: "PROFILE_NOT_FOUND",
    });

    expect(await queries.getPostView("user", 1)).toBeNull();
    expect(await queries.getProfile("user", "user:9")).toBeNull();
  });

  it("follows the comment pages and builds author links per mode", async () => {
    const comment = (id: number) => ({
      id,
      authorKind: "admin",
      authorId: 2,
      authorName: "PT",
      authorAvatarUrl: null,
      authorVerified: true,
      body: `c${id}`,
      createdAt: "2026-11-01T10:00:00.000Z",
      edited: false,
      canEdit: false,
      canDelete: true,
    });

    answer("GET", "/v1/social/posts/{id}/comments", 200, {
      items: [comment(1)],
      nextCursor: "next",
    });
    answer("GET", "/v1/social/posts/{id}/comments", 200, {
      items: [comment(2)],
      nextCursor: null,
    });

    const comments = await queries.listComments("user", 1);

    expect(comments?.map((item) => item.id)).toEqual([1, 2]);
    expect(comments?.[0].authorHref).toBe("/profile/admin/2");
    expect(state.calls).toHaveLength(2);
    expect(state.calls[1].options).toMatchObject({
      params: { query: { cursor: "next" } },
    });
  });

  it("lists notifications with a web link, and marks them read only on request", async () => {
    answer("GET", "/v1/social/notifications", 200, {
      items: [
        {
          id: 1,
          kind: "post_comment",
          text: "x",
          postId: 7,
          actorKey: "user:2",
          actorName: "Lan",
          actorAvatarUrl: null,
          createdAt: "2026-11-01T10:00:00.000Z",
          isUnread: true,
        },
        {
          id: 2,
          kind: "friend_request",
          text: "x",
          postId: null,
          actorKey: "user:3",
          actorName: "Minh",
          actorAvatarUrl: null,
          createdAt: "2026-11-01T09:00:00.000Z",
          isUnread: false,
        },
      ],
      nextCursor: null,
      unreadCount: 1,
    });

    const { notifications, unreadCount } = await queries.listNotifications(
      "user",
      "vi",
    );

    expect(unreadCount).toBe(1);
    expect(notifications.map((item) => item.href)).toEqual([
      "/post/7",
      "/friends?tab=requests",
    ]);
    expect(notifications[0].text).toContain("Lan");
    // Listing alone does not mark anything read.
    expect(state.calls.some((call) => call.path.endsWith("/read"))).toBe(false);

    await queries.markNotificationsRead("user");
    expect(lastCall()).toMatchObject({
      method: "POST",
      path: "/v1/social/notifications/read",
    });
  });

  it("links admin notifications to the admin post page", async () => {
    state.role = "admin";
    answer("GET", "/v1/social/notifications", 200, {
      items: [
        {
          id: 1,
          kind: "post_reaction",
          text: "x",
          postId: 7,
          actorKey: "user:2",
          actorName: "Lan",
          actorAvatarUrl: null,
          createdAt: "2026-11-01T10:00:00.000Z",
          isUnread: true,
        },
      ],
      nextCursor: null,
      unreadCount: 1,
    });

    const { notifications } = await queries.listNotifications("admin", "vi");

    expect(notifications[0].href).toBe("/admin/social/post/7");
  });

  it("builds report links for the super admin", async () => {
    state.role = "admin";
    answer("GET", "/v1/social/reports", 200, {
      openCount: 3,
      items: [
        {
          id: 1,
          targetKind: "comment",
          targetId: 11,
          reporterName: "Lan",
          reason: "",
          createdAt: "2026-11-01T10:00:00.000Z",
          preview: "rude",
          targetName: "Minh",
          postId: 7,
        },
        {
          id: 2,
          targetKind: "post",
          targetId: 8,
          reporterName: "Lan",
          reason: "",
          createdAt: "2026-11-01T10:00:00.000Z",
          preview: null,
          targetName: null,
          postId: null,
        },
        {
          id: 3,
          targetKind: "user",
          targetId: 5,
          reporterName: "Lan",
          reason: "",
          createdAt: "2026-11-01T10:00:00.000Z",
          preview: null,
          targetName: "Ann",
          postId: null,
        },
      ],
    });

    const { reports, openCount } = await queries.listOpenReports();

    expect(openCount).toBe(3);
    expect(reports.map((report) => report.href)).toEqual([
      "/admin/social/post/7",
      null,
      "/admin/social/profile/user/5",
    ]);
  });
});
