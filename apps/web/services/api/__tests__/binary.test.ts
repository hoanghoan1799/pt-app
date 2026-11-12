import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      state.cookies[name] ? { value: state.cookies[name] } : undefined,
  })),
  headers: vi.fn(async () => ({ get: () => null })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const { proxyApiFile, uploadApiBinary } = await import("@/services/api/binary");

const fetchMock = vi.fn();
// A fresh body per call: a Response can be read only once.
const respond = (response: Response) =>
  fetchMock.mockImplementation(() => response.clone());

beforeEach(() => {
  state.cookies = { pt_user: "user-token" };
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("API_URL", "http://api.test:4000");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sentRequest = () => fetchMock.mock.calls.at(-1)!;

describe("proxyApiFile", () => {
  it("relays the bytes with type, etag and a private cache policy", async () => {
    respond(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "image/webp",
          etag: '"v1"',
          "cache-control": "max-age=60",
          "set-cookie": "leak=1",
        },
      }),
    );

    const response = await proxyApiFile("user", "/v1/avatars/user/5");

    expect(sentRequest()[0]).toBe("http://api.test:4000/v1/avatars/user/5");
    expect(sentRequest()[1].headers.get("authorization")).toBe(
      "Bearer user-token",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("etag")).toBe('"v1"');
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      1, 2, 3,
    ]);
  });

  it("defaults to no-store when the API sets no cache header", async () => {
    respond(new Response("x", { status: 200 }));

    const response = await proxyApiFile("user", "/v1/chat/photos/1");

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("forwards If-None-Match and passes a 304 on without a body", async () => {
    respond(new Response(null, { status: 304 }));

    const response = await proxyApiFile("user", "/v1/avatars/user/5", {
      request: new Request("http://web.test/api/avatar/user/5", {
        headers: { "if-none-match": '"v1"' },
      }),
    });

    expect(sentRequest()[1].headers.get("if-none-match")).toBe('"v1"');
    expect(response.status).toBe(304);
  });

  it("throws the ApiError for a missing file", async () => {
    respond(
      new Response(
        JSON.stringify({
          code: "NOT_FOUND",
          message: "Không có ảnh",
          ref: "r",
        }),
        { status: 404 },
      ),
    );

    await expect(
      proxyApiFile("user", "/v1/avatars/user/9"),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("redirects to the session-end route when the session is over", async () => {
    respond(
      new Response(
        JSON.stringify({ code: "SESSION_INVALID", message: "x", ref: "r" }),
        { status: 401 },
      ),
    );

    await expect(proxyApiFile("user", "/v1/avatars/user/9")).rejects.toThrow(
      "REDIRECT:/session/end?role=user",
    );
  });
});

describe("uploadApiBinary", () => {
  it("posts the raw bytes with their content type and parses the JSON answer", async () => {
    respond(new Response(JSON.stringify({ id: 7 }), { status: 201 }));

    const result = await uploadApiBinary<{ id: number }>(
      "user",
      "/v1/chat/photos",
      {
        body: new Uint8Array([9, 9]),
        contentType: "image/webp",
        idempotencyKey: "k1",
      },
    );

    const [url, init] = sentRequest();

    expect(url).toBe("http://api.test:4000/v1/chat/photos");
    expect(init.method).toBe("POST");
    expect(init.headers.get("content-type")).toBe("image/webp");
    expect(init.headers.get("idempotency-key")).toBe("k1");
    expect(result).toEqual({ id: 7 });
  });

  it("returns undefined for a 204", async () => {
    respond(new Response(null, { status: 204 }));

    expect(
      await uploadApiBinary("user", "/v1/users/me/avatar", {
        body: new Uint8Array([1]),
        contentType: "image/png",
        method: "PUT",
      }),
    ).toBeUndefined();
  });
});
