import { describe, expect, it, vi } from "vitest";

import { FakeClock } from "../../test/support/auth.js";
import {
  FixedWindowLimiter,
  GiphyProxy,
  GiphyRateLimitedError,
  GiphyUnavailableError,
  TtlCache,
} from "./giphy.js";

describe("TtlCache", () => {
  it("expires entries after the TTL", () => {
    const cache = new TtlCache<string>(1000, 10);

    cache.set("a", "x", 0);
    expect(cache.get("a", 999)).toBe("x");
    expect(cache.get("a", 1000)).toBeUndefined();
  });

  it("evicts the oldest entry when full and refreshes a rewritten key", () => {
    const cache = new TtlCache<number>(1000, 2);

    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.set("a", 3, 0);
    cache.set("c", 4, 0);
    expect(cache.get("b", 1)).toBeUndefined();
    expect(cache.get("a", 1)).toBe(3);
    expect(cache.get("c", 1)).toBe(4);
  });
});

describe("FixedWindowLimiter", () => {
  it("allows the limit per key and window, then resets", () => {
    const limiter = new FixedWindowLimiter(2, 1000);

    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 10)).toBe(true);
    expect(limiter.allow("a", 20)).toBe(false);
    expect(limiter.allow("b", 20)).toBe(true);
    expect(limiter.allow("a", 1000)).toBe(true);
  });
});

describe("GiphyProxy", () => {
  const item = {
    id: "abc123",
    title: "Gym",
    images: {
      fixed_width: { url: "https://media1.giphy.com/media/abc123/200w.gif" },
    },
  };
  const build = (payload: unknown = { data: [item] }) => {
    const client = {
      enabled: true,
      fetchStickers: vi.fn().mockResolvedValue(payload),
    };
    const clock = new FakeClock();

    return { client, clock, proxy: new GiphyProxy(client, clock) };
  };

  it("maps the response and caches it per lower-cased query for five minutes", async () => {
    const { client, clock, proxy } = build();
    const first = await proxy.search("user:1", "Gym");

    expect(first).toEqual([
      {
        giphyId: "abc123",
        url: "https://media1.giphy.com/media/abc123/200w.gif",
        previewUrl: "https://media1.giphy.com/media/abc123/200w.gif",
        alt: "Gym",
      },
    ]);
    expect(await proxy.search("user:2", "gym")).toEqual(first);
    expect(client.fetchStickers).toHaveBeenCalledTimes(1);
    clock.advance(5 * 60_000);
    await proxy.search("user:1", "gym");
    expect(client.fetchStickers).toHaveBeenCalledTimes(2);
  });

  it("rate limits per viewer even for cached queries", async () => {
    const { proxy } = build();

    for (let index = 0; index < 30; index += 1) {
      await proxy.search("user:1", "gym");
    }
    await expect(proxy.search("user:1", "gym")).rejects.toBeInstanceOf(
      GiphyRateLimitedError,
    );
    await expect(proxy.search("user:2", "gym")).resolves.toHaveLength(1);
  });

  it("does not cache a failure and passes the error on", async () => {
    const { client, proxy } = build();

    client.fetchStickers.mockRejectedValueOnce(
      new GiphyUnavailableError("down"),
    );
    await expect(proxy.search("user:1", "x1")).rejects.toBeInstanceOf(
      GiphyUnavailableError,
    );
    await expect(proxy.search("user:1", "x1")).resolves.toHaveLength(1);
  });

  it("returns nothing for a malformed response", async () => {
    const { proxy } = build("garbage");

    expect(await proxy.search("user:1", "y")).toEqual([]);
  });
});
