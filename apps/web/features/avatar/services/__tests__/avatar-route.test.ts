import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/api/errors";

const state = vi.hoisted(() => ({
  user: null as null | { id: number },
  admin: null as null | { id: number },
  upstream: null as null | (() => Response | Promise<Response>),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/services/api/binary", () => ({
  proxyApiFile: vi.fn(async () => (state.upstream as () => Response)()),
}));

const route = await import("@/app/api/avatar/[kind]/[id]/route");
const { proxyApiFile } = await import("@/services/api/binary");

const get = (kind: string, id: number | string, query = "") =>
  route.GET(
    new NextRequest(`http://localhost/api/avatar/${kind}/${id}${query}`),
    { params: Promise.resolve({ kind, id: String(id) }) },
  );

beforeEach(() => {
  vi.mocked(proxyApiFile).mockClear();
  state.user = { id: 3 };
  state.admin = null;
  state.upstream = () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/webp", etag: '"1"' },
    });
});

// Who may see which photo, the ETag and the year-long cache are the API's:
// apps/api/test/avatars.e2e.test.ts ("GET /v1/avatars/:kind/:id").
describe("GET /api/avatar/[kind]/[id]", () => {
  it("relays the API's photo with the trainee's session", async () => {
    const response = await get("user", 3, "?v=1793953327");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(proxyApiFile).toHaveBeenCalledWith(
      "user",
      "/v1/avatars/user/3?v=1793953327",
      expect.objectContaining({ request: expect.any(Request) }),
    );
  });

  it("sends the admin session when an admin is signed in", async () => {
    state.admin = { id: 1 };
    await get("admin", 2);

    expect(proxyApiFile).toHaveBeenCalledWith(
      "admin",
      "/v1/avatars/admin/2",
      expect.anything(),
    );
  });

  it("passes the API's 304 on", async () => {
    state.upstream = () => new Response(null, { status: 304 });

    expect((await get("user", 3)).status).toBe(304);
  });

  it("401s without a session and never asks the API", async () => {
    state.user = null;

    expect((await get("user", 3)).status).toBe(401);
    expect(proxyApiFile).not.toHaveBeenCalled();
  });

  it("404s for unknown kinds and bad ids without asking the API", async () => {
    expect((await get("root", 3)).status).toBe(404);
    expect((await get("user", "abc")).status).toBe(404);
    expect((await get("user", 0)).status).toBe(404);
    expect(proxyApiFile).not.toHaveBeenCalled();
  });

  it("answers a plain 404 when the API refuses or has no photo", async () => {
    state.upstream = () => {
      throw new ApiError({
        status: 404,
        code: "AVATAR_NOT_FOUND",
        message: "x",
      });
    };
    const response = await get("user", 4);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("lets an API outage through as an error, not a missing photo", async () => {
    state.upstream = () => {
      throw new ApiError({
        kind: "network",
        status: 0,
        code: "API_UNREACHABLE",
        message: "down",
      });
    };

    await expect(get("user", 3)).rejects.toMatchObject({ status: 0 });
  });
});
