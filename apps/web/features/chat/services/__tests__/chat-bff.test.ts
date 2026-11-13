import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The chat routes are a thin BFF over the API. The API's own rules (access,
// lock, idempotency, redaction, 204) are tested in apps/api/test/chat.e2e.test.ts
// and realtime.e2e.test.ts; here: what the browser sees of its answers.

const state = vi.hoisted(() => ({
  calls: [] as { method: string; path: string; init: unknown }[],
  next: null as null | { status: number; body?: unknown },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/session", () => ({ readSessionToken: vi.fn() }));
vi.mock("@/services/api/client", () => {
  const answer = (method: string) => async (path: string, init: unknown) => {
    state.calls.push({ method, path, init });
    const next = state.next ?? { status: 200, body: {} };
    const ok = next.status < 400;

    return {
      response: new Response(null, { status: next.status }),
      data: ok ? next.body : undefined,
      error: ok ? undefined : next.body,
    };
  };

  return {
    apiClient: vi.fn(async () => ({
      GET: answer("GET"),
      POST: answer("POST"),
      PUT: answer("PUT"),
      PATCH: answer("PATCH"),
      DELETE: answer("DELETE"),
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

        return result.response.ok
          ? { ok: true, data: result.data }
          : {
              ok: false,
              error: new ApiError({
                status: result.response.status,
                code: (result.error as { code: string }).code,
                message: (result.error as { message: string }).message,
              }),
            };
      },
    ),
  };
});
vi.mock("@/services/auth-guard", () => ({
  requireUser: vi.fn(async () => ({ id: 1 })),
  requireAdmin: vi.fn(async () => ({ id: 9 })),
}));
vi.mock("@/services/action-errors", () => ({
  withResultErrorHandling: (_name: string, fn: (...args: never[]) => unknown) =>
    fn,
}));
vi.mock("@/services/env", () => ({
  getPublicApiUrl: () => "http://localhost:4000",
}));

const messages = await import("@/app/api/chat/messages/route");
const ticket = await import("@/app/api/chat/realtime-ticket/route");
const photos = await import("@/app/api/chat/photos/route");
const unread = await import("@/app/api/chat/unread/route");
const actions = await import("@/features/chat/services/chat-actions");

const get = (path: string) => new NextRequest(`http://localhost${path}`);

beforeEach(() => {
  state.calls = [];
  state.next = null;
});

describe("GET /api/chat/messages", () => {
  it("forwards the polling state and passes the API's 204 on", async () => {
    state.next = { status: 204 };
    const response = await messages.GET(
      get("/api/chat/messages?after=10&readUpTo=8&enabled=1&changedSince=5"),
    );

    expect(response.status).toBe(204);
    expect(state.calls[0]).toMatchObject({
      method: "GET",
      path: "/v1/chat/conversations/me/messages",
      init: {
        params: {
          query: {
            after: 10,
            readUpTo: 8,
            enabled: "1",
            changedSince: 5,
          },
        },
      },
    });
  });

  it("maps the API's file paths to this app's proxies", async () => {
    state.next = {
      status: 200,
      body: {
        messages: [
          {
            id: 1,
            photo: { url: "/v1/chat/photos/4", width: 1, height: 1 },
            sticker: null,
          },
        ],
      },
    };
    const response = await messages.GET(get("/api/chat/messages"));

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).messages[0].photo.url).toBe(
      "/api/chat/photos/4",
    );
  });

  it("answers a refused session with the old JSON, not a redirect", async () => {
    state.next = {
      status: 401,
      body: { code: "SESSION_INVALID", message: "x" },
    };
    const response = await messages.GET(get("/api/chat/messages"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });
});

describe("POST /api/chat/realtime-ticket", () => {
  it("adds the address the browser connects to", async () => {
    state.next = {
      status: 200,
      body: { ticket: "t", expiresInSeconds: 60, namespace: "/chat" },
    };
    const response = await ticket.POST(
      new NextRequest("http://localhost/api/chat/realtime-ticket?as=admin", {
        method: "POST",
      }),
    );

    expect(await response.json()).toEqual({
      ticket: "t",
      expiresInSeconds: 60,
      namespace: "/chat",
      url: "http://localhost:4000",
    });
  });

  it("tells a locked admin 403 so the thread keeps polling", async () => {
    state.next = {
      status: 403,
      body: { code: "ADMIN_LOCKED", message: "locked" },
    };
    const response = await ticket.POST(
      new NextRequest("http://localhost/api/chat/realtime-ticket?as=admin", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
  });
});

describe("POST /api/chat/photos", () => {
  it("refuses a cross-site upload before calling the API", async () => {
    const response = await photos.POST(
      new NextRequest("http://localhost/api/chat/photos", {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: new Uint8Array([1, 2, 3]),
      }),
    );

    expect(response.status).toBe(403);
    expect(state.calls).toHaveLength(0);
  });

  it("refuses an oversized declared length without reading the body", async () => {
    const response = await photos.POST(
      new NextRequest("http://localhost/api/chat/photos", {
        method: "POST",
        headers: { "content-length": String(5 * 1024 * 1024) },
        body: new Uint8Array([1]),
      }),
    );

    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe("too_large");
  });
});

describe("GET /api/chat/unread", () => {
  it("uses the admin session only when asked for", async () => {
    await unread.GET(get("/api/chat/unread?as=admin"));
    await unread.GET(get("/api/chat/unread"));

    expect(state.calls.map((call) => call.path)).toEqual([
      "/v1/chat/unread",
      "/v1/chat/unread",
    ]);
  });
});

describe("sendMessageAction", () => {
  const input = {
    body: "xin chào",
    clientId: "5b1cbd2c-7e2e-4a3a-9c9f-0e6d5a1b2c3d",
  };

  it("sends the client id as the idempotency key and returns the message", async () => {
    state.next = {
      status: 201,
      body: { message: { id: 4, body: "xin chào", photo: null } },
    };
    const result = await actions.sendMessageAction(input);

    expect(result).toMatchObject({
      status: "success",
      message: { id: 4 },
    });
    expect(state.calls[0]).toMatchObject({
      method: "POST",
      path: "/v1/chat/conversations/me/messages",
      init: {
        params: { header: { "Idempotency-Key": input.clientId } },
        body: { body: "xin chào" },
      },
    });
  });

  it("shows the API's own text for a refusal", async () => {
    state.next = {
      status: 403,
      body: { code: "CHAT_LOCKED", message: "PT đã tạm khoá nhắn tin" },
    };

    expect(await actions.sendMessageAction(input)).toEqual({
      status: "error",
      message: "PT đã tạm khoá nhắn tin",
    });
  });

  it("shows the generic text for a malformed request", async () => {
    state.next = {
      status: 400,
      body: { code: "VALIDATION_FAILED", message: "body: required" },
    };

    expect(await actions.sendMessageAction(input)).toEqual({
      status: "error",
      message: "Tin nhắn không hợp lệ",
    });
  });

  it("refuses bad input without calling the API", async () => {
    expect(
      await actions.sendMessageAction({ body: "", clientId: "nope" }),
    ).toMatchObject({ status: "error" });
    expect(state.calls).toHaveLength(0);
  });
});

describe("admin message actions", () => {
  it("reacts by message id, whichever conversation the page named", async () => {
    const admin = await import("@/features/chat/services/chat-admin-actions");

    state.next = { status: 200, body: { message: { id: 3 } } };
    await admin.adminReactMessageAction({
      conversationId: 5,
      messageId: 3,
      emoji: "❤️",
    });
    await admin.adminReactMessageAction({
      conversationId: 5,
      messageId: 3,
      emoji: null,
    });

    expect(state.calls.map((call) => [call.method, call.path])).toEqual([
      ["PUT", "/v1/chat/messages/{mid}/reaction"],
      ["DELETE", "/v1/chat/messages/{mid}/reaction"],
    ]);
  });
});
