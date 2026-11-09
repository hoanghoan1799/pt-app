"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/common/Avatar";
import { PhotoViewer, type ViewerPhoto } from "@/components/common/PhotoViewer";
import { GalleryFooter } from "@/features/chat/components/GalleryFooter";
import { useGalleryPager } from "@/features/chat/hooks/use-gallery-pager";
import { jumpHref } from "@/features/chat/utils/chat-links";
import {
  type GalleryPage,
  photoFileName,
  photoLabel,
} from "@/features/chat/utils/gallery-rules";

interface PhotoGalleryProps {
  initial: GalleryPage;
  // Page route that continues the list (`?tab=photos&before=<cursor>`).
  endpoint: string;
  // The chat page, for "Xem trong tin nhắn".
  chatPath: string;
  // Photos of the people in the chat, keyed "user" / "admin:<id>".
  avatars: Readonly<Record<string, string>>;
}

// The photos of a conversation (KAN-160, G1 to G3): a 3-column grid of
// squares, newest first, loading the next page when the end comes into view.
// Each tile carries the sender's avatar; a tap opens the viewer.
export const PhotoGallery = ({
  initial,
  endpoint,
  chatPath,
  avatars,
}: PhotoGalleryProps) => {
  const locale = useLocale();
  const t = useTranslations("chat.photoGallery");
  const router = useRouter();
  const { items, cursor, error, sentinel, loadMore, loadMoreQuietly } =
    useGalleryPager({
      initial,
      endpoint,
      tab: "photos",
      keyOf: (item) => item.photoId,
    });
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const viewerPhotos = useMemo<ViewerPhoto[]>(
    () =>
      items.map((item) => ({
        id: item.photoId,
        src: item.url,
        label: photoLabel(item, locale),
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
      <ul data-photo-gallery className="grid grid-cols-3 gap-0.5">
        {items.map((item, index) => (
          <li key={item.photoId} className="relative aspect-square bg-line">
            <button
              type="button"
              data-gallery-tile={item.photoId}
              aria-label={t("viewPhoto", { label: photoLabel(item, locale) })}
              onClick={() => setOpenIndex(index)}
              className="absolute inset-0 block"
            >
              {/* A plain img: the route is cookie-authenticated. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="size-full object-cover"
              />
            </button>
            <span className="pointer-events-none absolute right-1 bottom-1 rounded-full ring-2 ring-black/40">
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
      <PhotoViewer
        photos={viewerPhotos}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
        onNearEnd={cursor === null ? undefined : loadMoreQuietly}
        fileNameFor={(photo, mime) => photoFileName(photo.id, mime)}
        onShowInChat={(photo) => {
          const found = items.find((item) => item.photoId === photo.id);

          if (found) {
            router.push(jumpHref(chatPath, found.messageId));
          }
        }}
      />
    </>
  );
};
