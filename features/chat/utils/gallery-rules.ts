import { TIME_ZONE } from "@/constants/time";
import type { PhotoMime } from "@/features/chat/utils/photo-rules";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";
import { formatShortDateTime } from "@/utils/time";

// The photo gallery of a conversation (KAN-160): pure rules shared by the
// routes, the pages and the browser.

export const GALLERY_PAGE_SIZE = 60;
// Tiles in the preview on the info page.
export const INFO_PREVIEW_COUNT = 6;

// One photo of the gallery. `senderKey` is "user" or "admin:<id>", the same
// keys the thread uses for avatars and nicknames.
export interface GalleryPhoto {
  photoId: number;
  messageId: number;
  senderKey: string;
  senderName: string;
  url: string;
  width: number;
  height: number;
  createdAt: string;
}

// One page of any gallery tab. The cursor is a message id to pass as `before`
// for the next (older) page; null at the end.
export interface CursorPage<T> {
  items: T[];
  nextCursor: number | null;
}

export type GalleryPage = CursorPage<GalleryPhoto>;

// The tabs of the gallery page (`?tab=`).
export const GALLERY_TABS = ["photos", "stickers", "links"] as const;
export type GalleryTab = (typeof GALLERY_TABS)[number];

// Anything that is not a known tab is the first one.
export const parseGalleryTab = (
  value: string | string[] | null | undefined,
): GalleryTab => {
  const raw = Array.isArray(value) ? value[0] : value;

  return GALLERY_TABS.find((tab) => tab === raw) ?? "photos";
};

interface GallerySender {
  messageId: number;
  senderKey: string;
  senderName: string;
  createdAt: string;
}

// A sticker message: a bundled pack sticker, a GIPHY one, or the sender's own
// picture made into a sticker (custom).
export interface GallerySticker extends GallerySender {
  url: string;
  alt: string;
  kind: "pack" | "giphy" | "custom";
}

// One URL of one message; a message with two links gives two rows.
export interface GalleryLink extends GallerySender {
  key: string;
  href: string;
  text: string;
  domain: string;
}

export type StickerPage = CursorPage<GallerySticker>;
export type LinkPage = CursorPage<GalleryLink>;

// `before`: digits only, so "1e3" or "-5" are not cursors. Absent = newest.
export const parseGalleryCursor = (
  value: string | null,
): { ok: true; before: number | undefined } | { ok: false } => {
  if (value === null) {
    return { ok: true, before: undefined };
  }
  return /^[1-9]\d{0,14}$/.test(value)
    ? { ok: true, before: Number(value) }
    : { ok: false };
};

// "An · 05/10 18:30": the accessible name and caption of a photo.
export const photoLabel = (
  photo: Pick<GalleryPhoto, "senderName" | "createdAt">,
  locale: Locale = DEFAULT_LOCALE,
) =>
  `${photo.senderName} · ${formatShortDateTime(Date.parse(photo.createdAt), TIME_ZONE, locale)}`;

const EXTENSIONS: Record<PhotoMime, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

// The name of a downloaded photo; the extension follows the real type.
export const photoFileName = (photoId: number, mime: string | null) =>
  `pt-app-photo-${photoId}.${EXTENSIONS[mime as PhotoMime] ?? "webp"}`;

// Index after a step in the viewer, or the same index at either end.
export const stepIndex = (index: number, step: 1 | -1, length: number) =>
  Math.min(Math.max(index + step, 0), Math.max(length - 1, 0));

// The name of a downloaded sticker; the extension follows the real type.
export const stickerFileName = (messageId: number, mime: string | null) =>
  `pt-app-sticker-${messageId}.${mime === "image/gif" ? "gif" : (EXTENSIONS[mime as PhotoMime] ?? "webp")}`;
