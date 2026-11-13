import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookies: {} as Record<string, string>,
  incomingRequestId: null as string | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      state.cookies[name] ? { value: state.cookies[name] } : undefined,
  })),
  headers: vi.fn(async () => ({
    get: (name: string) =>
      name === "x-request-id" ? state.incomingRequestId : null,
  })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const { callApi, runApi, tryApi } = await import("@/services/api/call");
const { ApiError } = await import("@/services/api/errors");

const fetchMock = vi.fn();
// A fresh body per call: a Response can be read only once.
const respond = (response: Response) =>
  fetchMock.mockImplementation(() => response.clone());

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// The transport adds its headers through fetch's init, which overrides the
// request's own.
const sentHeaders = () => fetchMock.mock.calls.at(-1)![1].headers as Headers;
const lastRequest = () => fetchMock.mock.calls.at(-1)![0] as Request;

beforeEach(() => {
  state.cookies = { pt_user: "user-token", pt_admin: "admin-token" };
  state.incomingRequestId = null;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("API_URL", "http://api.test:4000/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("request headers", () => {
  it("sends the trainee cookie as a Bearer token to API_URL", async () => {
    respond(json(200, { ok: true }));

    await callApi("user", (api) => api.GET("/v1/auth/me"));

    expect(lastRequest().url).toBe("http://api.test:4000/v1/auth/me");
    expect(sentHeaders().get("authorization")).toBe("Bearer user-token");
  });

  it("uses the admin cookie for the admin role", async () => {
    respond(json(200, {}));

    await callApi("admin", (api) => api.GET("/v1/auth/me"));

    expect(sentHeaders().get("authorization")).toBe("Bearer admin-token");
  });

  it("sends no Authorization header for an anonymous call", async () => {
    respond(json(200, {}));

    await callApi("none", (api) => api.GET("/v1/health"));

    expect(sentHeaders().has("authorization")).toBe(false);
  });

  it("forwards the incoming X-Request-Id, else makes one", async () => {
    respond(json(200, {}));
    state.incomingRequestId = "req-from-edge";
    await callApi("user", (api) => api.GET("/v1/auth/me"));
    expect(sentHeaders().get("x-request-id")).toBe("req-from-edge");

    state.incomingRequestId = null;
    await callApi("user", (api) => api.GET("/v1/auth/me"));
    expect(sentHeaders().get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("forwards an Idempotency-Key only when the caller passes one", async () => {
    respond(json(200, {}));

    await runApi("user", (api) => api.GET("/v1/auth/me"));
    expect(sentHeaders().has("idempotency-key")).toBe(false);

    await runApi("user", (api) => api.GET("/v1/auth/me"), {
      idempotencyKey: "key-1",
    });
    expect(sentHeaders().get("idempotency-key")).toBe("key-1");
  });

  it("never lets a shared cache keep an authenticated GET", async () => {
    respond(json(200, {}));

    await callApi("user", (api) => api.GET("/v1/auth/me"));

    expect(fetchMock.mock.calls.at(-1)![1]).toMatchObject({
      cache: "no-store",
    });
  });
});

describe("errors", () => {
  it("throws an ApiError with the API's code, message and reference", async () => {
    respond(
      json(400, { code: "BAD_REQUEST", message: "Nope", ref: "abc12345" }),
    );

    const error = await callApi("user", (api) => api.GET("/v1/auth/me")).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "BAD_REQUEST",
      message: "Nope",
      ref: "abc12345",
    });
  });

  it("maps a 401 SESSION_INVALID to the session-end route of the role", async () => {
    respond(json(401, { code: "SESSION_INVALID", message: "x", ref: "r" }));

    await expect(
      callApi("user", (api) => api.GET("/v1/auth/me")),
    ).rejects.toThrow("REDIRECT:/session/end?role=user");
    await expect(
      callApi("admin", (api) => api.GET("/v1/auth/me")),
    ).rejects.toThrow("REDIRECT:/session/end?role=admin");
  });

  it("sends a locked admin to the lock screen", async () => {
    respond(json(403, { code: "ADMIN_LOCKED", message: "x", ref: "r" }));

    await expect(
      callApi("admin", (api) => api.GET("/v1/auth/me")),
    ).rejects.toThrow("REDIRECT:/admin/lock");
  });

  it("does not redirect for wrong credentials (a 401 without a session)", async () => {
    respond(
      json(401, { code: "INVALID_CREDENTIALS", message: "Sai", ref: "r" }),
    );

    const outcome = await tryApi("none", (api) =>
      api.POST("/v1/auth/login", {
        body: { email: "a@b.c", password: "x", clientKind: "web" },
      }),
    );

    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("tryApi returns 4xx but still throws 5xx", async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { code: "CONFLICT", message: "Trùng", ref: "r" }),
    );
    const refused = await tryApi("user", (api) => api.GET("/v1/auth/me"));

    expect(!refused.ok && refused.error.message).toBe("Trùng");

    fetchMock.mockResolvedValueOnce(
      json(500, { code: "INTERNAL_ERROR", message: "Đã có lỗi", ref: "r" }),
    );
    await expect(
      tryApi("user", (api) => api.GET("/v1/auth/me")),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("tryApi lets the caller handle chosen 401 codes itself", async () => {
    respond(json(401, { code: "SESSION_INVALID", message: "x", ref: "r" }));

    const outcome = await tryApi("admin", (api) => api.GET("/v1/auth/me"), {
      passthrough: ["SESSION_INVALID"],
    });

    expect(outcome.ok).toBe(false);
  });

  it("parses VALIDATION_FAILED into field errors", async () => {
    respond(
      json(400, {
        code: "VALIDATION_FAILED",
        message: "email: Email không hợp lệ; name: Nhập tên",
        ref: "r",
      }),
    );

    const outcome = await runApi("user", (api) => api.GET("/v1/auth/me"));

    expect(!outcome.ok && outcome.error.fieldErrors).toEqual({
      email: "Email không hợp lệ",
      name: "Nhập tên",
    });
  });

  it("falls back to a generic error when the body is not the API's shape", async () => {
    respond(new Response("<html>bad gateway</html>", { status: 502 }));

    const outcome = await runApi("user", (api) => api.GET("/v1/auth/me"));

    expect(!outcome.ok && outcome.error).toMatchObject({
      status: 502,
      code: "HTTP_502",
    });
  });

  it("turns a network failure into API_UNREACHABLE", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const outcome = await runApi("user", (api) => api.GET("/v1/auth/me"));

    expect(!outcome.ok && outcome.error).toMatchObject({
      kind: "network",
      status: 0,
      code: "API_UNREACHABLE",
    });
  });

  it("turns a timeout into API_TIMEOUT", async () => {
    fetchMock.mockImplementation(
      (_input: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason),
          );
        }),
    );

    const outcome = await runApi("user", (api) => api.GET("/v1/auth/me"), {
      timeoutMs: 20,
    });

    expect(!outcome.ok && outcome.error).toMatchObject({
      kind: "timeout",
      code: "API_TIMEOUT",
    });
  });

  it("returns undefined data for a 204", async () => {
    respond(new Response(null, { status: 204 }));

    expect(
      await callApi("user", (api) => api.POST("/v1/auth/logout")),
    ).toBeUndefined();
  });
});
