"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/common/Avatar";
import { LazyPhotoViewer } from "@/components/common/LazyPhotoViewer";
import type { ViewerPhoto } from "@/components/common/PhotoViewer";
import { GalleryFooter } from "@/features/chat/components/GalleryFooter";
import { useGalleryPager } from "@/features/chat/hooks/use-gallery-pager";
import { jumpHref } from "@/features/chat/utils/chat-links";
import {
  photoLabel,
  stickerFileName,
  type StickerPage,
} from "@/features/chat/utils/gallery-rules";

interface StickerGalleryProps {
  initial: StickerPage;
  endpoint: string;
  chatPath: string;
  avatars: Readonly<Record<string, string>>;
}

// Every sticker of the conversation, newest first: a grid of squares with the
// sender's avatar; a tap opens the viewer (download and "Xem trong tin nhắn").
export const StickerGallery = ({
  initial,
  endpoint,
  chatPath,
  avatars,
}: StickerGalleryProps) => {
  const locale = useLocale();
  const t = useTranslations("chat.stickerGallery");
  const router = useRouter();
  const { items, cursor, error, sentinel, loadMore, loadMoreQuietly } =
    useGalleryPager({
      initial,
      endpoint,
      tab: "stickers",
      keyOf: (item) => item.messageId,
    });
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const viewerPhotos = useMemo<ViewerPhoto[]>(
    () =>
      items.map((item) => ({
        id: item.messageId,
        src: item.url,
        label: `${item.alt} · ${photoLabel(item, locale)}`,
      })),
    [items, locale],
  );

  if (items.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-sm text-muted">{t("empty")}</p>
    );
  }

  return (
    <>
      <ul data-sticker-gallery className="grid grid-cols-3 gap-0.5">
        {items.map((item, index) => (
          <li
            key={item.messageId}
            className="relative aspect-square bg-surface"
          >
            <button
              type="button"
              data-gallery-sticker={item.messageId}
              aria-label={t("viewSticker", { label: photoLabel(item, locale) })}
              onClick={() => setOpenIndex(index)}
              className="absolute inset-0 block p-2"
            >
              {/* A plain img: custom stickers are cookie-authenticated. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="size-full object-contain"
              />
            </button>
            <span className="pointer-events-none absolute right-1 bottom-1 rounded-full ring-2 ring-black/20">
              <Avatar
                name={item.senderName}
                src={avatars[item.senderKey] ?? null}
                className="size-6 text-[10px]"
              />
            </span>
          </li>
        ))}
      </ul>
      <GalleryFooter
        sentinel={sentinel}
        cursor={cursor}
        error={error}
        onRetry={() => void loadMore()}
      />
      <LazyPhotoViewer
        photos={viewerPhotos}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
        onNearEnd={cursor === null ? undefined : loadMoreQuietly}
        fileNameFor={(photo, mime) => stickerFileName(photo.id, mime)}
        onShowInChat={(photo) => router.push(jumpHref(chatPath, photo.id))}
      />
    </>
  );
};
