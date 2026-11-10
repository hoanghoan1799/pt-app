"use client";

import { useEffect, useState } from "react";

import type { GiphySticker } from "@/features/chat/utils/giphy-rules";

const GIPHY_URL = "/api/chat/stickers/giphy";
const DEBOUNCE_MS = 400;

// Answers by query for the life of the tab, so retyping a word is instant and
// costs no request. Errors are not cached.
const cache = new Map<string, GiphySticker[]>();

interface Settled {
  query: string;
  // null = the request failed.
  stickers: GiphySticker[] | null;
}

const isSticker = (value: unknown): value is GiphySticker => {
  const item = value as Partial<GiphySticker> | null;

  return (
    typeof item?.giphyId === "string" &&
    typeof item.url === "string" &&
    typeof item.previewUrl === "string" &&
    typeof item.alt === "string"
  );
};

// GIF suggestions for the typed text (null = not eligible / switched off).
// Debounced, one request at a time (a new query aborts the old one), cached.
// Any failure, a rate limit or a server without a key just yields no GIFs; the
// typing row then shows only local stickers. "loading" is derived: there is a
// query but no answer for it yet.
export const useGiphySuggestions = (query: string | null) => {
  const [debounced, setDebounced] = useState<string | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [isDisabled, setIsDisabled] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!debounced || isDisabled || cache.has(debounced)) {
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(
          `${GIPHY_URL}?${new URLSearchParams({ q: debounced })}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data: { enabled?: unknown; stickers?: unknown } | null =
          await response.json().catch(() => null);

        if (response.ok && data?.enabled === false) {
          setIsDisabled(true);
          return;
        }
        if (response.ok && Array.isArray(data?.stickers)) {
          const stickers = data.stickers.filter(isSticker);

          cache.set(debounced, stickers);
          setSettled({ query: debounced, stickers });
          return;
        }
        setSettled({ query: debounced, stickers: null });
      } catch {
        if (!controller.signal.aborted) {
          setSettled({ query: debounced, stickers: null });
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [debounced, isDisabled]);

  if (!query || isDisabled) {
    return { stickers: [] as GiphySticker[], isLoading: false };
  }
  const cached = cache.get(query);

  if (cached) {
    return { stickers: cached, isLoading: false };
  }
  const failed = settled?.query === query && settled.stickers === null;

  return { stickers: [] as GiphySticker[], isLoading: !failed };
};
