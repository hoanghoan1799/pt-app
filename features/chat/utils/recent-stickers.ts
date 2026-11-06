import {
  bundledStickerUrl,
  findBundledSticker,
} from "@/features/chat/constants/stickers";
import { isGiphyMediaUrl } from "@/features/chat/utils/sticker-rules";

// "Gần đây" group of the sticker panel (docs/specs/chat-ux-v2.md E1): the last
// stickers this viewer sent, newest first, kept in localStorage.
export const RECENT_STICKERS_KEY = "pt-app:recent-stickers";
export const RECENT_STICKERS_MAX = 16;

export type RecentSticker =
  | { kind: "pack"; pack: string; id: string }
  | { kind: "giphy"; giphyId: string; url: string; alt: string };

export const recentStickerKey = (sticker: RecentSticker) =>
  sticker.kind === "pack"
    ? `pack:${sticker.pack}:${sticker.id}`
    : `giphy:${sticker.giphyId}`;

// Newest first, no duplicates, capped.
export const addRecentSticker = (
  list: RecentSticker[],
  sticker: RecentSticker,
): RecentSticker[] => {
  const key = recentStickerKey(sticker);

  return [
    sticker,
    ...list.filter((item) => recentStickerKey(item) !== key),
  ].slice(0, RECENT_STICKERS_MAX);
};

const toRecent = (value: unknown): RecentSticker | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const item = value as Record<string, unknown>;

  if (
    item.kind === "pack" &&
    typeof item.pack === "string" &&
    typeof item.id === "string"
  ) {
    return findBundledSticker(item.pack, item.id)
      ? { kind: "pack", pack: item.pack, id: item.id }
      : null;
  }
  if (
    item.kind === "giphy" &&
    typeof item.giphyId === "string" &&
    typeof item.url === "string" &&
    typeof item.alt === "string" &&
    isGiphyMediaUrl(item.url)
  ) {
    return {
      kind: "giphy",
      giphyId: item.giphyId,
      url: item.url,
      alt: item.alt.slice(0, 200),
    };
  }
  return null;
};

// Stored text -> a clean list. Bad JSON, unknown stickers and foreign URLs
// are dropped, so a hand-edited value can never reach the panel.
export const parseRecentStickers = (raw: string | null): RecentSticker[] => {
  if (!raw) {
    return [];
  }
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map(toRecent)
    .filter((item): item is RecentSticker => item !== null)
    .reduce<RecentSticker[]>(
      (list, item) =>
        list.some((seen) => recentStickerKey(seen) === recentStickerKey(item))
          ? list
          : [...list, item],
      [],
    )
    .slice(0, RECENT_STICKERS_MAX);
};

export const loadRecentStickers = (): RecentSticker[] => {
  try {
    return parseRecentStickers(
      window.localStorage.getItem(RECENT_STICKERS_KEY),
    );
  } catch {
    return [];
  }
};

export const saveRecentStickers = (list: RecentSticker[]) => {
  try {
    window.localStorage.setItem(RECENT_STICKERS_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked or full: the panel still works, just without memory.
  }
};

export const recentStickerView = (sticker: RecentSticker) => {
  if (sticker.kind === "giphy") {
    return { url: sticker.url, alt: sticker.alt };
  }
  const found = findBundledSticker(sticker.pack, sticker.id);

  return {
    url: found?.url ?? bundledStickerUrl(sticker.pack, sticker.id),
    alt: found?.alt ?? "",
  };
};
