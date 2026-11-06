import "server-only";

import {
  createTtlCache,
  GIPHY_CACHE_MAX_ENTRIES,
  GIPHY_CACHE_TTL_MS,
  GIPHY_RESULT_LIMIT,
  type GiphySticker,
  mapGiphyResponse,
} from "@/features/chat/utils/giphy-rules";
import { getGiphyApiKey } from "@/services/env";

const GIPHY_API = "https://api.giphy.com/v1/stickers";
const REQUEST_TIMEOUT_MS = 5000;

const cache = createTtlCache<GiphySticker[]>(
  GIPHY_CACHE_TTL_MS,
  GIPHY_CACHE_MAX_ENTRIES,
);

export const isGiphyEnabled = () => getGiphyApiKey() !== undefined;

export class GiphyUnavailableError extends Error {}

// Trending when the query is empty, otherwise search. rating=g always. The
// API key is added here and never leaves the server; errors carry no URL (it
// holds the key) and the key is never logged.
export const fetchGiphyStickers = async (
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GiphySticker[]> => {
  const apiKey = getGiphyApiKey();

  if (!apiKey) {
    throw new GiphyUnavailableError("GIPHY_API_KEY is not set");
  }
  const cacheKey = query.toLowerCase();
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }
  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(GIPHY_RESULT_LIMIT),
    rating: "g",
  });

  if (query) {
    params.set("q", query);
    params.set("lang", "vi");
  }
  let response: Response;

  try {
    response = await fetchImpl(
      `${GIPHY_API}/${query ? "search" : "trending"}?${params}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" },
    );
  } catch {
    throw new GiphyUnavailableError("GIPHY request failed");
  }
  if (!response.ok) {
    throw new GiphyUnavailableError(`GIPHY answered ${response.status}`);
  }
  const stickers = mapGiphyResponse(await response.json().catch(() => null));

  cache.set(cacheKey, stickers);
  return stickers;
};
