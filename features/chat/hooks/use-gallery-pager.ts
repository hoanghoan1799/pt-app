"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CursorPage,
  GalleryTab,
} from "@/features/chat/utils/gallery-rules";

const LOAD_FAILED = "Không tải thêm được. Thử lại nhé.";

const isPage = <T>(value: unknown): value is CursorPage<T> =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as CursorPage<T>).items);

// Cursor paging shared by the gallery tabs: shows the first page, loads the
// next (older) one when `sentinel` comes into view or `loadMore` is called,
// and never lists the same item twice.
export const useGalleryPager = <T>({
  initial,
  endpoint,
  tab,
  keyOf,
}: {
  initial: CursorPage<T>;
  endpoint: string;
  tab: GalleryTab;
  keyOf: (item: T) => string | number;
}) => {
  const [items, setItems] = useState<T[]>(initial.items);
  const [cursor, setCursor] = useState<number | null>(initial.nextCursor);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const keyRef = useRef(keyOf);

  useEffect(() => {
    keyRef.current = keyOf;
  });

  const loadMore = useCallback(async () => {
    if (cursor === null || loading.current) {
      return;
    }
    loading.current = true;
    setError(null);
    try {
      const response = await fetch(`${endpoint}?tab=${tab}&before=${cursor}`, {
        cache: "no-store",
      });
      const data: unknown = response.ok ? await response.json() : null;

      if (!isPage<T>(data)) {
        setError(LOAD_FAILED);
        return;
      }
      setItems((current) => {
        const known = new Set(current.map((item) => keyRef.current(item)));

        return [
          ...current,
          ...data.items.filter((item) => !known.has(keyRef.current(item))),
        ];
      });
      setCursor(data.nextCursor);
    } catch {
      setError(LOAD_FAILED);
    } finally {
      loading.current = false;
    }
  }, [cursor, endpoint, tab]);

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

  // A failed page is retried by the button, not by a viewer on every render.
  const loadMoreQuietly = useCallback(() => {
    if (error === null) {
      void loadMore();
    }
  }, [error, loadMore]);

  return { items, cursor, error, sentinel, loadMore, loadMoreQuietly };
};
