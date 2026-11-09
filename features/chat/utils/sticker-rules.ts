import { z } from "zod";

import { findBundledSticker } from "@/features/chat/constants/stickers";
import {
  customStickerRef,
  customStickerUrl,
  parseCustomRef,
  STICKER_ALT_CUSTOM,
} from "@/features/chat/utils/custom-sticker-rules";
import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

export const STICKER_PREVIEW = "đã gửi một sticker";

export const stickerPreview = (locale: Locale = DEFAULT_LOCALE) =>
  getFormatTranslator(locale)("sticker.preview");
export const STICKER_ALT_GIPHY = "Sticker GIPHY";

const GIPHY_ID = /^[A-Za-z0-9]{3,40}$/;
// media.giphy.com, media0.giphy.com ... media12.giphy.com.
const GIPHY_MEDIA_HOST = /^media\d{0,3}\.giphy\.com$/;
const GIPHY_URL_MAX_LENGTH = 500;

// Only https URLs on the GIPHY media hosts, default port, no credentials. The
// URL is stored and later rendered by every client, so anything else (other
// hosts, http, look-alike domains) is rejected.
export const isGiphyMediaUrl = (value: string) => {
  if (value.length > GIPHY_URL_MAX_LENGTH) {
    return false;
  }
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    GIPHY_MEDIA_HOST.test(url.hostname)
  );
};

// A bundled sticker is { pack, id } from the manifest; a GIPHY one carries
// its id and media URL, and the id must be a path segment of that URL so the
// two cannot disagree.
const bundledInput = z.object({
  pack: z.string().max(40),
  id: z.string().max(60),
});
const giphyInput = z.object({
  giphyId: z.string().regex(GIPHY_ID),
  url: z.string().refine(isGiphyMediaUrl),
});

// A personal sticker (KAN-158) is only an id here; that the sender owns it is
// checked against the database in the send action.
const customInput = z.object({ customId: z.number().int().positive() });

export const stickerInputSchema = z
  .union([bundledInput, giphyInput, customInput])
  .refine(
    (value) => {
      if ("pack" in value) {
        return findBundledSticker(value.pack, value.id) !== null;
      }
      if ("customId" in value) {
        return true;
      }
      return new URL(value.url).pathname.split("/").includes(value.giphyId);
    },
    { message: "unknown sticker" },
  );

export type StickerInput = z.infer<typeof stickerInputSchema>;

// What is stored on the message row.
export const toStoredSticker = (input: StickerInput) => {
  if ("pack" in input) {
    return {
      stickerRef: `pack:${input.id}`,
      stickerUrl: findBundledSticker(input.pack, input.id)?.url ?? null,
    };
  }
  if ("customId" in input) {
    return {
      stickerRef: customStickerRef(input.customId),
      stickerUrl: customStickerUrl(input.customId),
    };
  }
  return { stickerRef: `giphy:${input.giphyId}`, stickerUrl: input.url };
};

export interface ChatSticker {
  kind: "pack" | "giphy" | "custom";
  url: string;
  alt: string;
}

// Row -> payload. A row whose ref/url do not check out (hand-edited data)
// yields no sticker rather than an unchecked URL.
export const toChatSticker = (
  stickerRef: string | null,
  stickerUrl: string | null,
): ChatSticker | null => {
  if (!stickerRef || !stickerUrl) {
    return null;
  }
  if (stickerRef.startsWith("giphy:")) {
    return isGiphyMediaUrl(stickerUrl)
      ? { kind: "giphy", url: stickerUrl, alt: STICKER_ALT_GIPHY }
      : null;
  }
  if (stickerRef.startsWith("custom:")) {
    const id = parseCustomRef(stickerRef);

    return id !== null && stickerUrl === customStickerUrl(id)
      ? { kind: "custom", url: stickerUrl, alt: STICKER_ALT_CUSTOM }
      : null;
  }
  if (stickerRef.startsWith("pack:")) {
    const id = stickerRef.slice("pack:".length);
    const pack = stickerUrl.split("/")[2] ?? "";
    const found = findBundledSticker(pack, id);

    return found && found.url === stickerUrl
      ? { kind: "pack", url: found.url, alt: found.alt }
      : null;
  }
  return null;
};
