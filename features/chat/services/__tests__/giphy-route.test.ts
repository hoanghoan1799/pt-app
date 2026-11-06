import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { id: number; chatEnabled: boolean | null },
  admin: null as null | { id: number },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn() }));

const route = await import("@/app/api/chat/stickers/giphy/route");

const MEDIA = "https://media3.giphy.com/media/abc123/200w.gif";
const ok = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200 });

const fetchMock = vi.fn<typeof fetch>();
let counter = 0;

// A fresh query per call so the in-memory cache and rate limiter of earlier
// tests never hide a request.
const get = (q?: string) =>
  route.GET(
    new NextRequest(
      `http://localhost/api/chat/stickers/giphy${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`,
    ),
  );
const uniqueQuery = () => `gym ${(counter += 1)}`;

beforeEach(() => {
  state.user = { id: 1, chatEnabled: true };
  state.admin = null;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GIPHY_API_KEY", "secret-key-123");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/chat/stickers/giphy", () => {
  it("is 401 without a session, before anything else", async () => {
    state.user = null;
    const response = await get("x");

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers enabled:false and never calls GIPHY when the key is unset", async () => {
    vi.stubEnv("GIPHY_API_KEY", "");
    const response = await get("gym");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false, stickers: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is 403 for a trainee whose chat is locked", async () => {
    state.user = { id: 1, chatEnabled: false };

    expect((await get("x")).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches with the key, rating g, and returns only picker fields", async () => {
    fetchMock.mockResolvedValue(
      ok({
        data: [
          {
            id: "abc123",
            title: "Nice",
            images: { fixed_width: { url: MEDIA } },
          },
        ],
      }),
    );
    const query = uniqueQuery();
    const response = await get(query);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      enabled: true,
      stickers: [
        { giphyId: "abc123", url: MEDIA, previewUrl: MEDIA, alt: "Nice" },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("secret-key-123");
    const called = new URL(String(fetchMock.mock.calls[0][0]));

    expect(called.origin + called.pathname).toBe(
      "https://api.giphy.com/v1/stickers/search",
    );
    expect(called.searchParams.get("q")).toBe(query);
    expect(called.searchParams.get("rating")).toBe("g");
    expect(called.searchParams.get("api_key")).toBe("secret-key-123");
  });

  it("uses trending for an empty query, and an admin may call it", async () => {
    state.user = null;
    state.admin = { id: 4 };
    fetchMock.mockResolvedValue(ok({ data: [] }));
    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true, stickers: [] });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/stickers/trending?");
  });

  it("serves a repeated query from the cache", async () => {
    fetchMock.mockResolvedValue(ok({ data: [] }));
    const query = uniqueQuery();

    await get(query);
    await get(query.toUpperCase());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a query over 50 characters", async () => {
    expect((await get("a".repeat(51))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 502 without leaking the key when GIPHY fails", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    const response = await get(uniqueQuery());

    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("secret");

    fetchMock.mockRejectedValue(new Error("network"));
    expect((await get(uniqueQuery())).status).toBe(502);
  });

  it("rate limits one viewer at 30 requests a minute", async () => {
    state.user = { id: 99, chatEnabled: true };
    fetchMock.mockImplementation(async () => ok({ data: [] }));
    const statuses: number[] = [];

    for (let i = 0; i < 31; i += 1) {
      statuses.push((await get(uniqueQuery())).status);
    }
    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
