import { STICKER_KEYWORDS } from "@/features/chat/constants/sticker-keywords";
import {
  type BundledSticker,
  STICKER_GROUPS,
} from "@/features/chat/constants/stickers";

// Typing suggestions above the chat input: which bundled stickers match what
// the viewer is typing. Pure; the row component and the GIPHY hook live apart.
export const SUGGEST_MAX_WORDS = 4;
export const SUGGEST_MAX_CHARS = 30;
export const SUGGEST_MIN_PREFIX = 3;
export const GIPHY_SUGGEST_MIN_CHARS = 2;

// lowercase, no diacritics, "đ" -> "d", punctuation -> space, single spaces.
export const normalizeSuggestText = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// Variation selectors differ between keyboards ("❤" vs "❤️"); ignore them.
const stripVariation = (text: string) => text.replace(/️/g, "");

export const isEmojiOnly = (text: string) =>
  text.trim() !== "" && /^[\p{Extended_Pictographic}‍️\s]+$/u.test(text);

export type SuggestQuery =
  | { kind: "text"; text: string; normalized: string; words: string[] }
  | { kind: "emoji"; text: string };

// null = nothing to suggest for this text (empty, a "/" command, too long).
export const getSuggestQuery = (raw: string): SuggestQuery | null => {
  const text = raw.trim();

  if (!text || text.startsWith("/")) {
    return null;
  }
  if (isEmojiOnly(text)) {
    return { kind: "emoji", text: stripVariation(text) };
  }
  const normalized = normalizeSuggestText(text);
  const words = normalized.split(" ").filter(Boolean);

  if (
    words.length === 0 ||
    words.length > SUGGEST_MAX_WORDS ||
    Array.from(text).length > SUGGEST_MAX_CHARS
  ) {
    return null;
  }
  return { kind: "text", text, normalized, words };
};

// The text GIPHY is asked about: eligible short text, never emoji-only.
export const getGiphySuggestQuery = (raw: string): string | null => {
  const query = getSuggestQuery(raw);

  if (
    !query ||
    query.kind !== "text" ||
    query.normalized.length < GIPHY_SUGGEST_MIN_CHARS
  ) {
    return null;
  }
  return query.text.replace(/\s+/g, " ");
};

interface IndexedSticker {
  sticker: BundledSticker;
  // normalized keywords per locale
  keywords: Record<"vi" | "en" | "zh", string[]>;
  emoji: string[];
}

const normalizeAll = (list: string[]) =>
  list.map(normalizeSuggestText).filter(Boolean);

const INDEX: IndexedSticker[] = STICKER_GROUPS.flatMap((group) =>
  group.stickers.map((sticker) => {
    const entry = STICKER_KEYWORDS[sticker.id];

    return {
      sticker,
      keywords: {
        vi: normalizeAll(entry?.vi ?? []),
        en: normalizeAll(entry?.en ?? []),
        zh: normalizeAll(entry?.zh ?? []),
      },
      emoji: (entry?.emoji ?? []).map(stripVariation),
    };
  }),
);

// Chinese has no spaces between words, so its keywords match as substrings.
const hasCjk = (text: string) => /[㐀-鿿]/u.test(text);

const scoreKeyword = (
  keyword: string,
  normalized: string,
  words: string[],
): number => {
  if (normalized === keyword) {
    return 3;
  }
  if (hasCjk(keyword)) {
    return normalized.includes(keyword) ? 2 : 0;
  }
  // A one-letter keyword only counts when it is the whole text.
  if (
    (keyword.length >= 2 || words.length === 1) &&
    ` ${normalized} `.includes(` ${keyword} `)
  ) {
    return 2;
  }
  const last = words[words.length - 1];

  if (
    last.length >= SUGGEST_MIN_PREFIX &&
    !keyword.includes(" ") &&
    keyword.startsWith(last)
  ) {
    return 1;
  }
  return 0;
};

// Recent stickers (newest first) rank above equal scores, never across a
// whole score step.
const recentBoost = (id: string, recentIds: string[]) => {
  const index = recentIds.indexOf(id);

  return index === -1 ? 0 : 0.5 - index * 0.01;
};

// Bundled stickers matching the typed text, best first. Keywords come from the
// viewer's locale plus English plus emoji.
export const matchStickerSuggestions = (
  raw: string,
  locale: string,
  recentIds: string[] = [],
): BundledSticker[] => {
  const query = getSuggestQuery(raw);

  if (!query) {
    return [];
  }
  const keywordLocales: Array<"vi" | "en" | "zh"> =
    locale === "vi" || locale === "zh" ? [locale, "en"] : ["en"];
  const scored: Array<{ sticker: BundledSticker; score: number }> = [];

  for (const entry of INDEX) {
    let score = 0;

    if (query.kind === "emoji") {
      if (entry.emoji.some((emoji) => query.text.includes(emoji))) {
        score = 3;
      }
    } else {
      for (const keywordLocale of keywordLocales) {
        for (const keyword of entry.keywords[keywordLocale]) {
          score = Math.max(
            score,
            scoreKeyword(keyword, query.normalized, query.words),
          );
        }
      }
      const plain = stripVariation(query.text);

      if (entry.emoji.some((emoji) => plain.includes(emoji))) {
        score = 3;
      }
    }
    if (score > 0) {
      scored.push({
        sticker: entry.sticker,
        score: score + recentBoost(entry.sticker.id, recentIds),
      });
    }
  }
  // Array.prototype.sort is stable, so equal scores keep the pack order.
  return scored.sort((a, b) => b.score - a.score).map((item) => item.sticker);
};
