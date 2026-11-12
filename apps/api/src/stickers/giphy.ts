import { Inject, Injectable } from "@nestjs/common";
import {
  type GiphySticker,
  STICKER_GIPHY_CACHE_MAX_ENTRIES,
  STICKER_GIPHY_CACHE_TTL_MS,
  STICKER_GIPHY_RATE_LIMIT,
  STICKER_GIPHY_RATE_WINDOW_MS,
  STICKER_GIPHY_RESULT_LIMIT,
  stickerMapGiphyResponse,
} from "@pt/contracts";

import { Clock } from "../common/clock.js";
import { APP_ENV } from "../config/app-config.module.js";
import type { Env } from "../config/env.schema.js";

export class GiphyUnavailableError extends Error {}

// The port to GIPHY. The production adapter calls the HTTP API; tests inject a
// fake, so nothing in the suite touches the network.
export const GIPHY_CLIENT = Symbol("GIPHY_CLIENT");

export interface GiphyClient {
  // False when no API key is configured: the feature switches off.
  readonly enabled: boolean;
  // The raw GIPHY JSON for trending (empty query) or a search. Throws
  // GiphyUnavailableError on any failure; the error never carries the URL (it
  // holds the key).
  fetchStickers(query: string): Promise<unknown>;
}

const GIPHY_API = "https://api.giphy.com/v1/stickers";
const REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class HttpGiphyClient implements GiphyClient {
  private readonly apiKey: string | undefined;

  constructor(@Inject(APP_ENV) env: Pick<Env, "GIPHY_API_KEY">) {
    this.apiKey = env.GIPHY_API_KEY;
  }

  get enabled() {
    return this.apiKey !== undefined;
  }

  // rating=g always; the key is added here and never leaves the server.
  async fetchStickers(query: string) {
    if (!this.apiKey) {
      throw new GiphyUnavailableError("GIPHY_API_KEY is not set");
    }
    const params = new URLSearchParams({
      api_key: this.apiKey,
      limit: String(STICKER_GIPHY_RESULT_LIMIT),
      rating: "g",
    });

    if (query) {
      params.set("q", query);
      params.set("lang", "vi");
    }
    let response: Response;

    try {
      response = await fetch(
        `${GIPHY_API}/${query ? "search" : "trending"}?${params}`,
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
    } catch {
      throw new GiphyUnavailableError("GIPHY request failed");
    }
    if (!response.ok) {
      throw new GiphyUnavailableError(`GIPHY answered ${response.status}`);
    }
    return response.json().catch(() => null);
  }
}

// Small TTL cache (insertion order doubles as eviction order).
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(key: string, now: number) {
    const entry = this.entries.get(key);

    if (!entry || entry.expires <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, now: number) {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;

      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(key, { value, expires: now + this.ttlMs });
  }
}

// Fixed window per key, in memory: good enough to stop a runaway client on one
// instance; the GIPHY quota is the real ceiling.
export class FixedWindowLimiter {
  private readonly windows = new Map<
    string,
    { start: number; count: number }
  >();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now: number) {
    const entry = this.windows.get(key);

    if (!entry || now - entry.start >= this.windowMs) {
      if (this.windows.size > 1000) {
        this.windows.clear();
      }
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}

export class GiphyRateLimitedError extends Error {}

// The sticker source behind GET /v1/chat/stickers/giphy: rate limit per viewer,
// 5 minute cache per query, mapping to the picker fields.
@Injectable()
export class GiphyProxy {
  private readonly cache = new TtlCache<GiphySticker[]>(
    STICKER_GIPHY_CACHE_TTL_MS,
    STICKER_GIPHY_CACHE_MAX_ENTRIES,
  );
  private readonly limiter = new FixedWindowLimiter(
    STICKER_GIPHY_RATE_LIMIT,
    STICKER_GIPHY_RATE_WINDOW_MS,
  );

  constructor(
    @Inject(GIPHY_CLIENT) private readonly client: GiphyClient,
    private readonly clock: Clock,
  ) {}

  get enabled() {
    return this.client.enabled;
  }

  async search(viewerKey: string, query: string) {
    const now = this.clock.now().getTime();

    if (!this.limiter.allow(viewerKey, now)) {
      throw new GiphyRateLimitedError();
    }
    const cacheKey = query.toLowerCase();
    const cached = this.cache.get(cacheKey, now);

    if (cached) {
      return cached;
    }
    const stickers = stickerMapGiphyResponse(
      await this.client.fetchStickers(query),
    );

    this.cache.set(cacheKey, stickers, now);
    return stickers;
  }
}
