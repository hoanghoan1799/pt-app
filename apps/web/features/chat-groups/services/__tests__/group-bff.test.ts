import { RESTRICTION_MESSAGES } from "@pt/contracts";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The group thread's server actions and route handlers are a thin BFF over
// /v1/chat/groups. The API's own rules (membership, managers-only, chat off,
// restriction, idempotency, redaction) are tested in
// apps/api/test/chat-groups*.e2e.test.ts; here: the session check, the input
// check and what reaches the API, and what the browser gets back.

const state = vi.hoisted(() => ({
  calls: [] as { actor: string; method: string; path: string; init: unknown }[],
  answers: [] as { status: number; body?: unknown }[],
  guards: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/session", () => ({ readSessionToken: vi.fn() }));
vi.mock("@/services/api/client", () => {
  const answer =
    (actor: string, method: string) => async (path: string, init: unknown) => {
      state.calls.push({ actor, method, path, init });
      const next = state.answers.shift() ?? { status: 200, body: {} };
      const ok = next.status < 400;

      return {
        response: new Response(null, { status: next.status }),
        data: ok ? next.body : undefined,
        error: ok ? undefined : next.body,
      };
    };

  return {
    apiClient: vi.fn(async (actor: string) => ({
      GET: answer(actor, "GET"),
      POST: answer(actor, "POST"),
      PUT: answer(actor, "PUT"),
      PATCH: answer(actor, "PATCH"),
      DELETE: answer(actor, "DELETE"),
    })),
    currentRequestId: vi.fn(async () => "req-1"),
  };
});
vi.mock("@/services/api/call", async () => {
  const { ApiError } = await import("@/services/api/errors");
  const client = await import("@/services/api/client");

  return {
    tryApi: vi.fn(
      async (
        actor: string,
        call: (api: unknown) => Promise<{
          response: Response;
          data?: unknown;
          error?: unknown;
        }>,
      ) => {
        const result = await call(await client.apiClient(actor as never));
        const body = result.error as {
          code: string;
          message: string;
          details?: Record<string, string>;
        };

        return result.response.ok
          ? { ok: true, data: result.data }
          : {
              ok: false,
              error: new ApiError({
                status: result.response.status,
                code: body.code,
                message: body.message,
                details: body.details,
              }),
            };
      },
    ),
  };
});
vi.mock("@/services/auth-guard", () => ({
  requireUser: vi.fn(async () => {
    state.guards.push("user");
    return { id: 5 };
  }),
  requireAdmin: vi.fn(async () => {
    state.guards.push("admin");
    return { id: 1 };
  }),
  requireSuperAdmin: vi.fn(async () => {
    state.guards.push("super_admin");
    return { id: 1 };
  }),
}));
vi.mock("@/services/action-errors", () => ({
  withResultErrorHandling: (_name: string, fn: (...args: never[]) => unknown) =>
    fn,
}));

const actions = await import("@/features/chat-groups/services/group-actions");
const messagesRoute =
  await import("@/app/api/chat/groups/[groupId]/messages/route");
const unreadRoute = await import("@/app/api/chat/unread/route");

const CLIENT_ID = "5b1cbd2c-7e2e-4a3a-9c9f-0e6d5a1b2c3d";

const stored = (overrides: Record<string, unknown> = {}) => ({
  message: {
    id: 40,
    groupId: 3,
    body: "chào nhóm",
    photo: {
      id: 2,
      url: "/v1/chat/groups/3/photos/2",
      width: 10,
      height: 10,
      alt: "Ảnh trong tin nhắn",
    },
    ...overrides,
  },
});

beforeEach(() => {
  state.calls = [];
  state.answers = [];
  state.guards = [];
});

describe("sendGroupMessageAction", () => {
  it("checks the trainee session, sends the client id as the idempotency key and maps the photo URL", async () => {
    state.answers.push({ status: 201, body: stored() });

    const result = await actions.sendGroupMessageAction({
      groupId: 3,
      body: "chào nhóm",
      clientId: CLIENT_ID,
      replyToMessageId: 12,
    });

    expect(state.guards).toEqual(["user"]);
    expect(state.calls).toEqual([
      {
        actor: "user",
        method: "POST",
        path: "/v1/chat/groups/{groupId}/messages",
        init: {
          params: {
            path: { groupId: 3 },
            header: { "Idempotency-Key": CLIENT_ID },
          },
          body: {
            body: "chào nhóm",
            clientId: CLIENT_ID,
            replyToMessageId: 12,
          },
        },
      },
    ]);
    expect(result).toMatchObject({
      status: "success",
      message: {
        id: 40,
        photo: { url: "/api/chat/groups/3/photos/2" },
      },
    });
  });

  it("sends as the admin from the admin action", async () => {
    state.answers.push({ status: 201, body: stored() });

    await actions.adminSendGroupMessageAction({
      groupId: 3,
      sticker: { customId: 4 },
      clientId: CLIENT_ID,
    });

    expect(state.guards).toEqual(["admin"]);
    expect(state.calls[0]).toMatchObject({
      actor: "admin",
      init: { body: { sticker: { customId: 4 } } },
    });
  });

  it("shows the restricted text when the API refuses a restricted trainee", async () => {
    state.answers.push({
      status: 403,
      body: { code: "RESTRICTED", message: RESTRICTION_MESSAGES.RESTRICTED },
    });

    expect(
      await actions.sendGroupMessageAction({
        groupId: 3,
        body: "xin chào",
        clientId: CLIENT_ID,
      }),
    ).toEqual({ status: "error", message: RESTRICTION_MESSAGES.RESTRICTED });
  });

  it("shows the generic group text for a refused shape", async () => {
    state.answers.push({
      status: 400,
      body: { code: "VALIDATION_FAILED", message: "body: Too long" },
    });

    expect(
      await actions.sendGroupMessageAction({
        groupId: 3,
        body: "x",
        clientId: CLIENT_ID,
      }),
    ).toEqual({ status: "error", message: "Thông tin nhóm không hợp lệ" });
  });

  it.each([
    ["no client id", { groupId: 3, body: "hi" }],
    ["a bad client id", { groupId: 3, body: "hi", clientId: "nope" }],
    ["a bad group id", { groupId: 0, body: "hi", clientId: CLIENT_ID }],
    ["no content", { groupId: 3, clientId: CLIENT_ID }],
    [
      "a sticker with text",
      {
        groupId: 3,
        body: "hi",
        sticker: { customId: 4 },
        clientId: CLIENT_ID,
      },
    ],
    ["null", null],
  ])("refuses %s without calling the API", async (_label, input) => {
    expect(await actions.sendGroupMessageAction(input)).toEqual({
      status: "error",
      message: "Thông tin nhóm không hợp lệ",
    });
    expect(state.calls).toEqual([]);
  });
});

describe("message mutations", () => {
  it("puts a reaction and deletes it for null", async () => {
    state.answers.push({ status: 200, body: stored() });
    state.answers.push({ status: 200, body: stored() });

    await actions.reactGroupMessageAction({
      groupId: 3,
      messageId: 40,
      emoji: "❤️",
    });
    await actions.reactGroupMessageAction({
      groupId: 3,
      messageId: 40,
      emoji: null,
    });

    expect(state.calls.map((call) => [call.method, call.init])).toEqual([
      [
        "PUT",
        { params: { path: { groupId: 3, mid: 40 } }, body: { emoji: "❤️" } },
      ],
      ["DELETE", { params: { path: { groupId: 3, mid: 40 } } }],
    ]);
  });

  it("refuses an emoji outside the list without calling the API", async () => {
    expect(
      await actions.reactGroupMessageAction({
        groupId: 3,
        messageId: 40,
        emoji: "🦄",
      }),
    ).toMatchObject({ status: "error" });
    expect(state.calls).toEqual([]);
  });

  it("edits with the trimmed text and unsends as the author's session", async () => {
    state.answers.push({ status: 200, body: stored() });
    state.answers.push({ status: 200, body: stored() });

    await actions.adminEditGroupMessageAction({
      groupId: 3,
      messageId: 40,
      body: "  đã sửa ",
    });
    await actions.unsendGroupMessageAction({ groupId: 3, messageId: 40 });

    expect(state.calls).toMatchObject([
      {
        actor: "admin",
        method: "PATCH",
        path: "/v1/chat/groups/{groupId}/messages/{mid}",
        init: { body: { body: "đã sửa" } },
      },
      {
        actor: "user",
        method: "DELETE",
        path: "/v1/chat/groups/{groupId}/messages/{mid}",
      },
    ]);
    expect(state.guards).toEqual(["admin", "user"]);
  });

  it("refuses an empty edit without calling the API", async () => {
    expect(
      await actions.editGroupMessageAction({
        groupId: 3,
        messageId: 40,
        body: "   ",
      }),
    ).toMatchObject({ status: "error" });
    expect(state.calls).toEqual([]);
  });

  it("moves the read cursor and reports a refusal", async () => {
    state.answers.push({ status: 200, body: { lastReadMessageId: 40 } });
    state.answers.push({
      status: 404,
      body: {
        code: "GROUP_NOT_FOUND",
        message: "Không tìm thấy nhóm chat này",
      },
    });

    expect(
      await actions.markGroupReadAction({ groupId: 3, lastReadMessageId: 40 }),
    ).toBeUndefined();
    expect(
      await actions.adminMarkGroupReadAction({
        groupId: 3,
        lastReadMessageId: 40,
      }),
    ).toEqual({ status: "error", message: "Không tìm thấy nhóm chat này" });
    expect(state.calls.map((call) => [call.actor, call.path])).toEqual([
      ["user", "/v1/chat/groups/{groupId}/read"],
      ["admin", "/v1/chat/groups/{groupId}/read"],
    ]);
  });

  it("hides as an admin only", async () => {
    state.answers.push({ status: 200, body: stored({ hidden: true }) });

    await actions.hideGroupMessageAction({
      groupId: 3,
      messageId: 40,
      hidden: true,
    });

    expect(state.guards).toEqual(["admin"]);
    expect(state.calls[0]).toMatchObject({
      actor: "admin",
      method: "PUT",
      path: "/v1/chat/groups/{groupId}/messages/{mid}/hidden",
      init: { body: { hidden: true } },
    });
  });
});

describe("resolvePtChangeAlertAction", () => {
  it("needs a super admin and resolves once", async () => {
    state.answers.push({ status: 204 });

    expect(
      await actions.resolvePtChangeAlertAction({
        groupId: 3,
        messageId: 9,
        choice: "keep",
      }),
    ).toEqual({ status: "success" });
    expect(state.guards).toEqual(["super_admin"]);
    expect(state.calls[0]).toMatchObject({
      method: "POST",
      path: "/v1/chat/groups/{groupId}/messages/{mid}/alert",
      init: { body: { choice: "keep" } },
    });
  });

  it("says who handled it first", async () => {
    state.answers.push({
      status: 409,
      body: {
        code: "GROUP_ALERT_HANDLED",
        message: "Cảnh báo này đã được xử lý",
        details: { handledBy: "Boss" },
      },
    });

    expect(
      await actions.resolvePtChangeAlertAction({
        groupId: 3,
        messageId: 9,
        choice: "remove",
      }),
    ).toEqual({
      status: "error",
      message: "Cảnh báo này đã được xử lý",
      handledBy: "Boss",
    });
  });

  it("refuses a choice that is not keep or remove", async () => {
    expect(
      await actions.resolvePtChangeAlertAction({
        groupId: 3,
        messageId: 9,
        choice: "superseded",
      }),
    ).toMatchObject({ status: "error" });
    expect(state.calls).toEqual([]);
  });
});

describe("GET /api/chat/groups/:groupId/messages", () => {
  const get = (path: string) => new NextRequest(`http://localhost${path}`);
  const params = (groupId: string) => ({
    params: Promise.resolve({ groupId }),
  });

  it("forwards the group cursors only and maps file URLs", async () => {
    state.answers.push({
      status: 200,
      body: {
        messages: [stored().message],
        group: { avatarUrl: "/v1/chat/groups/3/avatar?v=1&t=abc" },
      },
    });

    const response = await messagesRoute.GET(
      get(
        "/api/chat/groups/3/messages?as=admin&after=10&changedSince=5&readUpTo=8&enabled=1",
      ),
      params("3"),
    );
    const body = await response.json();

    expect(state.calls[0]).toEqual({
      actor: "admin",
      method: "GET",
      path: "/v1/chat/groups/{groupId}/messages",
      init: {
        params: {
          path: { groupId: 3 },
          query: { after: 10, before: undefined, changedSince: 5 },
        },
      },
    });
    expect(body.messages[0].photo.url).toBe("/api/chat/groups/3/photos/2");
    expect(body.group.avatarUrl).toBe("/api/chat/groups/3/avatar?v=1&t=abc");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("serves the trainee unless asked and passes a 404 on", async () => {
    state.answers.push({
      status: 404,
      body: {
        code: "GROUP_NOT_FOUND",
        message: "Không tìm thấy nhóm chat này",
      },
    });

    const response = await messagesRoute.GET(
      get("/api/chat/groups/3/messages"),
      params("3"),
    );

    expect(state.calls[0].actor).toBe("user");
    expect(response.status).toBe(404);
  });

  it("refuses a malformed group id without calling the API", async () => {
    const response = await messagesRoute.GET(
      get("/api/chat/groups/abc/messages"),
      params("abc"),
    );

    expect(response.status).toBe(400);
    expect(state.calls).toEqual([]);
  });
});

describe("GET /api/chat/unread", () => {
  const get = (path: string) => new NextRequest(`http://localhost${path}`);

  it("adds the group unread next to the chat counts", async () => {
    state.answers.push({ status: 200, body: { count: 2, coachCount: 2 } });
    state.answers.push({
      status: 200,
      body: { total: 3, perGroup: [{ groupId: 7, unread: 3 }] },
    });

    const response = await unreadRoute.GET(get("/api/chat/unread"));

    expect(state.calls.map((call) => [call.actor, call.path])).toEqual([
      ["user", "/v1/chat/unread"],
      ["user", "/v1/chat/groups/unread"],
    ]);
    expect(await response.json()).toEqual({
      count: 2,
      coachCount: 2,
      groups: { total: 3, perGroup: [{ groupId: 7, unread: 3 }] },
    });
  });

  it("counts no group unread when the group answer fails", async () => {
    state.answers.push({ status: 200, body: { count: 1, perTrainee: [] } });
    state.answers.push({
      status: 403,
      body: { code: "FORBIDDEN", message: "x" },
    });

    const response = await unreadRoute.GET(get("/api/chat/unread?as=admin"));

    expect(state.calls.map((call) => call.actor)).toEqual(["admin", "admin"]);
    expect(await response.json()).toEqual({
      count: 1,
      perTrainee: [],
      groups: { total: 0, perGroup: [] },
    });
  });
});
