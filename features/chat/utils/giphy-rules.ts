import { isGiphyMediaUrl } from "@/features/chat/utils/sticker-rules";

export const GIPHY_QUERY_MAX_LENGTH = 50;
export const GIPHY_RESULT_LIMIT = 24;
// Per viewer; plenty for typing a search, far below the GIPHY free-tier cap.
export const GIPHY_RATE_LIMIT = 30;
export const GIPHY_RATE_WINDOW_MS = 60_000;
export const GIPHY_CACHE_TTL_MS = 5 * 60_000;
export const GIPHY_CACHE_MAX_ENTRIES = 100;

export interface GiphySticker {
  giphyId: string;
  // Full-size sticker, stored on the message.
  url: string;
  // Small version for the picker grid.
  previewUrl: string;
  alt: string;
}

// Empty = trending. Whitespace is collapsed and control characters dropped;
// null means the query is too long to send.
export const normalizeGiphyQuery = (raw: string | null) => {
  const query = (raw ?? "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(query).length > GIPHY_QUERY_MAX_LENGTH ? null : query;
};

interface RawImage {
  url?: unknown;
}

// Reduces the GIPHY response to what the picker needs. Anything whose URL is
// not a GIPHY media URL is dropped, so the browser is never handed a URL the
// send action would refuse.
export const mapGiphyResponse = (payload: unknown): GiphySticker[] => {
  const data = (payload as { data?: unknown } | null)?.data;

  if (!Array.isArray(data)) {
    return [];
  }
  const stickers: GiphySticker[] = [];

  for (const item of data) {
    const id: unknown = item?.id;
    const images = item?.images as Record<string, RawImage> | undefined;
    const full = images?.fixed_width?.url ?? images?.original?.url;
    const small = images?.fixed_width_small?.url ?? full;
    const title: unknown = item?.title;

    if (
      typeof id === "string" &&
      /^[A-Za-z0-9]{3,40}$/.test(id) &&
      typeof full === "string" &&
      typeof small === "string" &&
      isGiphyMediaUrl(full) &&
      isGiphyMediaUrl(small)
    ) {
      stickers.push({
        giphyId: id,
        url: full,
        previewUrl: small,
        alt:
          typeof title === "string" && title.trim()
            ? title.trim().slice(0, 100)
            : "Sticker GIPHY",
      });
    }
  }
  return stickers;
};

// Fixed window per key, in memory: good enough to stop a runaway client on
// one server instance; the GIPHY quota is the real ceiling.
export const createRateLimiter = (
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
) => {
  const windows = new Map<string, { start: number; count: number }>();

  return (key: string) => {
    const time = now();
    const entry = windows.get(key);

    if (!entry || time - entry.start >= windowMs) {
      if (windows.size > 1000) {
        windows.clear();
      }
      windows.set(key, { start: time, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
};

// Small TTL cache (insertion order doubles as eviction order).
export const createTtlCache = <T>(
  ttlMs: number,
  maxEntries: number,
  now: () => number = Date.now,
) => {
  const entries = new Map<string, { value: T; expires: number }>();

  return {
    get: (key: string) => {
      const entry = entries.get(key);

      if (!entry || entry.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set: (key: string, value: T) => {
      entries.delete(key);
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;

        if (oldest !== undefined) {
          entries.delete(oldest);
        }
      }
      entries.set(key, { value, expires: now() + ttlMs });
    },
  };
};
