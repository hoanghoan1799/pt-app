import { z } from "zod";

// Bundled sticker pack (KAN-144): Microsoft Fluent Emoji, Flat style, MIT
// licence. Files are static assets of the web app at
// /stickers/<pack>/<id>.svg. Ids are unique across the manifest because a
// stored ref is "pack:<id>".

export const STICKER_PACK_ID = "fluent";

export const STICKER_BUNDLED_GROUPS = [
  {
    key: "workout",
    stickers: [
      { id: "flexed-biceps", alt: "Cơ bắp" },
      { id: "person-lifting-weights", alt: "Nâng tạ" },
      { id: "running-shoe", alt: "Giày chạy bộ" },
      { id: "stopwatch", alt: "Đồng hồ bấm giờ" },
      { id: "trophy", alt: "Cúp" },
      { id: "1st-place-medal", alt: "Huy chương vàng" },
      { id: "bullseye", alt: "Trúng đích" },
      { id: "fire", alt: "Lửa" },
      { id: "rocket", alt: "Tên lửa" },
    ],
  },
  {
    key: "food",
    stickers: [
      { id: "green-salad", alt: "Salad" },
      { id: "avocado", alt: "Bơ" },
      { id: "banana", alt: "Chuối" },
      { id: "broccoli", alt: "Bông cải xanh" },
      { id: "cut-of-meat", alt: "Thịt" },
      { id: "droplet", alt: "Giọt nước" },
      { id: "carrot", alt: "Cà rốt" },
      { id: "strawberry", alt: "Dâu tây" },
      { id: "glass-of-milk", alt: "Ly sữa" },
    ],
  },
  {
    key: "mood",
    stickers: [
      { id: "smiling-face-with-hearts", alt: "Mặt cười với tim" },
      { id: "face-with-tears-of-joy", alt: "Cười ra nước mắt" },
      { id: "star-struck", alt: "Mắt sao" },
      { id: "smiling-face-with-sunglasses", alt: "Mặt cười đeo kính" },
      { id: "partying-face", alt: "Ăn mừng" },
      { id: "face-with-steam-from-nose", alt: "Hầm hầm" },
      { id: "exploding-head", alt: "Nổ đầu" },
      { id: "sleeping-face", alt: "Ngủ" },
      { id: "loudly-crying-face", alt: "Khóc to" },
      { id: "red-heart", alt: "Trái tim đỏ" },
      { id: "thumbs-up", alt: "Giơ ngón cái" },
      { id: "clapping-hands", alt: "Vỗ tay" },
      { id: "folded-hands", alt: "Chắp tay" },
    ],
  },
] as const;

// pack id -> sticker id -> alt.
const PACKS: Record<string, Record<string, string>> = {
  [STICKER_PACK_ID]: Object.fromEntries(
    STICKER_BUNDLED_GROUPS.flatMap((group) =>
      group.stickers.map((sticker) => [sticker.id, sticker.alt]),
    ),
  ),
};

export const stickerBundledUrl = (pack: string, id: string) =>
  `/stickers/${pack}/${id}.svg`;

// Own-property lookup so "constructor" or "__proto__" are never a pack/id.
export const findBundledSticker = (pack: string, id: string) => {
  const stickers = Object.hasOwn(PACKS, pack) ? PACKS[pack] : undefined;

  if (!stickers || !Object.hasOwn(stickers, id)) {
    return null;
  }
  return { pack, id, alt: stickers[id], url: stickerBundledUrl(pack, id) };
};

export const STICKER_ALT_GIPHY = "Sticker GIPHY";
export const STICKER_ALT_CUSTOM = "Sticker của tôi";

const GIPHY_ID = /^[A-Za-z0-9]{3,40}$/;
// media.giphy.com, media0.giphy.com ... media12.giphy.com.
const GIPHY_MEDIA_HOST = /^media\d{0,3}\.giphy\.com$/;
const GIPHY_URL_MAX_LENGTH = 500;

// Only https URLs on the GIPHY media hosts, default port, no credentials. The
// URL is stored and later rendered by every client, so anything else is
// rejected.
export const stickerIsGiphyMediaUrl = (value: string) => {
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

export const stickerCustomRef = (id: number) => `custom:${id}`;

const CUSTOM_REF = /^custom:([1-9]\d{0,14})$/;

export const stickerParseCustomRef = (ref: string) => {
  const match = CUSTOM_REF.exec(ref);

  return match ? Number(match[1]) : null;
};

// A bundled sticker is { pack, id }; a GIPHY one carries its id and media
// URL, and the id must be a path segment of that URL; a personal one is only
// an id (that the sender owns it is checked against the database).
const bundledInput = z.object({
  pack: z.string().max(40),
  id: z.string().max(60),
});
const giphyInput = z.object({
  giphyId: z.string().regex(GIPHY_ID),
  url: z.string().refine(stickerIsGiphyMediaUrl),
});
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

// What is stored on the message row. `customUrl` builds the serve URL.
export const stickerToStored = (
  input: StickerInput,
  customUrl: (id: number) => string,
) => {
  if ("pack" in input) {
    return {
      stickerRef: `pack:${input.id}`,
      stickerUrl: findBundledSticker(input.pack, input.id)?.url ?? null,
    };
  }
  if ("customId" in input) {
    return {
      stickerRef: stickerCustomRef(input.customId),
      stickerUrl: customUrl(input.customId),
    };
  }
  return { stickerRef: `giphy:${input.giphyId}`, stickerUrl: input.url };
};

export type StickerKind = "pack" | "giphy" | "custom";

export type StickerView = { kind: StickerKind; url: string; alt: string };

// Row -> payload. A row whose ref/url do not check out (hand-edited data)
// yields no sticker rather than an unchecked URL. A personal sticker's URL is
// always derived from its ref, so rows copied from the old app (whose stored
// URL is /api/...) keep working.
export const stickerToView = (
  stickerRef: string | null,
  stickerUrl: string | null,
  customUrl: (id: number) => string,
): StickerView | null => {
  if (!stickerRef) {
    return null;
  }
  if (stickerRef.startsWith("custom:")) {
    const id = stickerParseCustomRef(stickerRef);

    return id === null
      ? null
      : { kind: "custom", url: customUrl(id), alt: STICKER_ALT_CUSTOM };
  }
  if (!stickerUrl) {
    return null;
  }
  if (stickerRef.startsWith("giphy:")) {
    return stickerIsGiphyMediaUrl(stickerUrl)
      ? { kind: "giphy", url: stickerUrl, alt: STICKER_ALT_GIPHY }
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

export type GiphySticker = {
  giphyId: string;
  // Full-size sticker, stored on the message.
  url: string;
  // Small version for the picker grid.
  previewUrl: string;
  alt: string;
};

type RawImage = { url?: unknown };

// Reduces the GIPHY response to what the picker needs. Anything whose URL is
// not a GIPHY media URL is dropped.
export const stickerMapGiphyResponse = (payload: unknown): GiphySticker[] => {
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
      GIPHY_ID.test(id) &&
      typeof full === "string" &&
      typeof small === "string" &&
      stickerIsGiphyMediaUrl(full) &&
      stickerIsGiphyMediaUrl(small)
    ) {
      stickers.push({
        giphyId: id,
        url: full,
        previewUrl: small,
        alt:
          typeof title === "string" && title.trim()
            ? title.trim().slice(0, 100)
            : STICKER_ALT_GIPHY,
      });
    }
  }
  return stickers;
};

// Empty = trending. Whitespace is collapsed and control characters dropped;
// null means the query is too long to send.
export const stickerNormalizeGiphyQuery = (
  raw: string | null | undefined,
  maxLength: number,
) => {
  const query = (raw ?? "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(query).length > maxLength ? null : query;
};
