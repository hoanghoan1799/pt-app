import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real public/sw.js in a vm with a fake worker scope and cache, so the
// rules for what the worker answers (and never caches) are pinned by tests.

const ORIGIN = "https://pt.example";
const source = readFileSync(
  path.join(import.meta.dirname, "..", "..", "..", "public", "sw.js"),
  "utf8",
);

interface FakeResponse {
  status: number;
  type: string;
  clone: () => FakeResponse;
}

const makeResponse = (status = 200, type = "basic"): FakeResponse => {
  const response: FakeResponse = { status, type, clone: () => response };

  return response;
};

type Handler = (event: unknown) => void;

const setup = () => {
  const handlers = new Map<string, Handler>();
  const store = new Map<string, FakeResponse>();
  const cache = {
    match: vi.fn(async (request: { url: string } | string) =>
      store.get(typeof request === "string" ? request : request.url),
    ),
    put: vi.fn(async (request: { url: string }, response: FakeResponse) => {
      store.set(request.url, response);
    }),
    addAll: vi.fn(async () => undefined),
    add: vi.fn(async () => undefined),
  };
  const fetchMock = vi.fn(async () => makeResponse());
  const networkError = { error: true };
  const context = {
    self: {
      location: new URL(`${ORIGIN}/sw.js?v=test`),
      addEventListener: (type: string, handler: Handler) =>
        handlers.set(type, handler),
    },
    URL,
    caches: {
      open: vi.fn(async () => cache),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    },
    fetch: fetchMock,
    Response: { error: () => networkError },
    Promise,
  };

  vm.runInNewContext(source, context);

  // Fires a fetch event; resolves to the response the worker gave, or "pass"
  // when it left the request to the browser.
  const send = async (
    url: string,
    init: { method?: string; mode?: string; range?: boolean } = {},
  ) => {
    let responded: Promise<unknown> | undefined;
    const waiting: Promise<unknown>[] = [];
    const event = {
      request: {
        url,
        method: init.method ?? "GET",
        mode: init.mode ?? "no-cors",
        headers: { has: (name: string) => name === "range" && !!init.range },
      },
      respondWith: (value: Promise<unknown>) => {
        responded = value;
      },
      waitUntil: (value: Promise<unknown>) => {
        waiting.push(value);
      },
    };

    handlers.get("fetch")?.(event);
    const result = responded === undefined ? "pass" : await responded;

    await Promise.all(waiting);
    return result;
  };

  return { cache, fetchMock, networkError, send };
};

describe("service worker fetch rules", () => {
  let sw: ReturnType<typeof setup>;

  beforeEach(() => {
    sw = setup();
  });

  it.each([
    "/_next/static/chunks/app.js",
    "/stickers/fluent/smile.png",
    "/icons/icon-192.png",
  ])("serves %s cache first and stores it on a miss", async (pathname) => {
    const url = `${ORIGIN}${pathname}`;
    const first = await sw.send(url);

    expect(first).toMatchObject({ status: 200 });
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);
    expect(sw.cache.put).toHaveBeenCalledTimes(1);

    const second = await sw.send(url);

    expect(second).toBe(sw.cache.put.mock.calls[0][1]);
    // The second load came from the cache: no new network request.
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);
    expect(sw.cache.put).toHaveBeenCalledTimes(1);
  });

  it("does not store an error response", async () => {
    sw.fetchMock.mockResolvedValueOnce(makeResponse(404));

    const result = await sw.send(`${ORIGIN}/_next/static/chunks/gone.js`);

    expect(result).toMatchObject({ status: 404 });
    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it("does not store a non-basic (cross-origin or opaque) response", async () => {
    sw.fetchMock.mockResolvedValueOnce(makeResponse(200, "opaque"));

    await sw.send(`${ORIGIN}/stickers/fluent/odd.png`);

    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it("returns a network error for an uncached asset while offline", async () => {
    sw.fetchMock.mockRejectedValueOnce(new TypeError("offline"));

    const result = await sw.send(`${ORIGIN}/_next/static/chunks/new.js`);

    expect(result).toBe(sw.networkError);
    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it.each([
    "/api/chat/messages?conversationId=1",
    "/api/avatar/user/1",
    "/api/chat/photos/12",
    "/workouts",
    "/workouts?_rsc=abc",
    "/_next/image?url=%2Fx.png&w=64&q=75",
    "/stickers-private/a.png",
    "/messages/coach",
  ])("never touches %s", async (pathname) => {
    const result = await sw.send(`${ORIGIN}${pathname}`);

    expect(result).toBe("pass");
    expect(sw.cache.put).not.toHaveBeenCalled();
    expect(sw.fetchMock).not.toHaveBeenCalled();
  });

  it("never touches a cross-origin file under a cached prefix", async () => {
    expect(await sw.send("https://cdn.example/_next/static/a.js")).toBe("pass");
  });

  it("never touches non-GET requests, even under a cached prefix", async () => {
    expect(
      await sw.send(`${ORIGIN}/_next/static/chunks/a.js`, { method: "POST" }),
    ).toBe("pass");
  });

  it("leaves range requests to the browser", async () => {
    expect(
      await sw.send(`${ORIGIN}/stickers/fluent/clip.png`, { range: true }),
    ).toBe("pass");
  });

  it("keeps navigations network first and never stores the page", async () => {
    const result = await sw.send(`${ORIGIN}/workouts`, { mode: "navigate" });

    expect(result).toMatchObject({ status: 200 });
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);
    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it("falls back to the cached offline page when a navigation fails", async () => {
    const offline = makeResponse();

    await sw.cache.put({ url: "/offline" }, offline);
    sw.fetchMock.mockRejectedValueOnce(new TypeError("offline"));

    const result = await sw.send(`${ORIGIN}/summary`, { mode: "navigate" });

    expect(result).toBe(offline);
  });
});
