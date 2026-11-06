"use client";

import { useEffect, useState } from "react";

import type { GiphySticker } from "@/features/chat/utils/giphy-rules";

const GIPHY_URL = "/api/chat/stickers/giphy";
const DEBOUNCE_MS = 350;

export type GiphyStatus = "loading" | "ready" | "error";
export type GiphyError = "rate_limited" | "unavailable" | null;

interface Settled {
  // The (debounced) query this answer belongs to.
  query: string;
  stickers: GiphySticker[];
  error: GiphyError;
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

// Trending (empty query) and search through our own route; the key never
// reaches the browser. `enabled` stays null until the first answer, and is
// false when the server has no GIPHY key (the tab is then hidden). The query
// is debounced; "loading" is derived (the settled answer is for another
// query), so no state is set synchronously in an effect.
export const useGiphyStickers = (rawQuery: string) => {
  const [debounced, setDebounced] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(rawQuery.trim()), DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [rawQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const settle = (stickers: GiphySticker[], error: GiphyError) =>
      setSettled({ query: debounced, stickers, error });

    const load = async () => {
      try {
        const response = await fetch(
          `${GIPHY_URL}?${new URLSearchParams({ q: debounced })}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data: { enabled?: unknown; stickers?: unknown } | null =
          await response.json().catch(() => null);

        if (response.ok && data?.enabled === false) {
          setEnabled(false);
          return;
        }
        // 429 and 502 mean a key exists (or may exist): keep the tab and say so.
        setEnabled(true);
        if (response.ok && Array.isArray(data?.stickers)) {
          settle(data.stickers.filter(isSticker), null);
          return;
        }
        settle([], response.status === 429 ? "rate_limited" : "unavailable");
      } catch {
        if (!controller.signal.aborted) {
          settle([], "unavailable");
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [debounced]);

  const isCurrent = settled !== null && settled.query === debounced;
  const status: GiphyStatus = !isCurrent
    ? "loading"
    : settled.error
      ? "error"
      : "ready";

  return {
    enabled,
    status,
    stickers: isCurrent ? settled.stickers : [],
    error: isCurrent ? settled.error : null,
    // The user typed but the debounce has not fired yet.
    isSearching: rawQuery.trim() !== debounced,
  };
};
