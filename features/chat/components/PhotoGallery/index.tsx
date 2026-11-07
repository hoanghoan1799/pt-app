"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/common/Avatar";
import { PhotoViewer, type ViewerPhoto } from "@/components/common/PhotoViewer";
import { jumpHref } from "@/features/chat/utils/chat-links";
import {
  type GalleryPage,
  type GalleryPhoto,
  photoFileName,
  photoLabel,
} from "@/features/chat/utils/gallery-rules";

interface PhotoGalleryProps {
  initial: GalleryPage;
  // Page route that continues the list (`?before=<cursor>`).
  endpoint: string;
  // The chat page, for "Xem trong tin nhắn".
  chatPath: string;
  // Photos of the people in the chat, keyed "user" / "admin:<id>".
  avatars: Readonly<Record<string, string>>;
}

const LOAD_FAILED = "Không tải thêm được ảnh. Thử lại nhé.";

const isGalleryPage = (value: unknown): value is GalleryPage =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as GalleryPage).items);

// The photos of a conversation (KAN-160, G1 to G3): a 3-column grid of
// squares, newest first, loading the next page when the end comes into view.
// Each tile carries the sender's avatar; a tap opens the viewer.
export const PhotoGallery = ({
  initial,
  endpoint,
  chatPath,
  avatars,
}: PhotoGalleryProps) => {
  const router = useRouter();
  const [items, setItems] = useState<GalleryPhoto[]>(initial.items);
  const [cursor, setCursor] = useState<number | null>(initial.nextCursor);
  const [error, setError] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const loading = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (cursor === null || loading.current) {
      return;
    }
    loading.current = true;
    setError(null);
    try {
      const response = await fetch(`${endpoint}?before=${cursor}`, {
        cache: "no-store",
      });
      const data: unknown = response.ok ? await response.json() : null;

      if (!isGalleryPage(data)) {
        setError(LOAD_FAILED);
        return;
      }
      setItems((current) => {
        const known = new Set(current.map((item) => item.photoId));

        return [
          ...current,
          ...data.items.filter((item) => !known.has(item.photoId)),
        ];
      });
      setCursor(data.nextCursor);
    } catch {
      setError(LOAD_FAILED);
    } finally {
      loading.current = false;
    }
  }, [cursor, endpoint]);

  useEffect(() => {
    const node = sentinel.current;

    if (!node || cursor === null || error !== null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, error, loadMore, items.length]);

  // A failed page is retried by the button, not by the viewer on every render.
  const loadMoreForViewer = useCallback(() => {
    if (error === null) {
      void loadMore();
    }
  }, [error, loadMore]);

  const viewerPhotos = useMemo<ViewerPhoto[]>(
    () =>
      items.map((item) => ({
        id: item.photoId,
        src: item.url,
        label: photoLabel(item),
      })),
    [items],
  );

  if (items.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-sm text-muted">
        Chưa có ảnh nào trong cuộc trò chuyện này
      </p>
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
              aria-label={`Xem ảnh của ${photoLabel(item)}`}
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
      {cursor !== null && (
        <div ref={sentinel} className="flex justify-center px-4 py-6">
          {error ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-muted transition active:bg-line"
            >
              {error}
            </button>
          ) : (
            <p className="text-sm text-muted" role="status">
              Đang tải…
            </p>
          )}
        </div>
      )}
      <PhotoViewer
        photos={viewerPhotos}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
        onNearEnd={cursor === null ? undefined : loadMoreForViewer}
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
