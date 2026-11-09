"use client";

import { useCallback, useEffect, useState } from "react";

import {
  CUSTOM_STICKER_ERRORS,
  CUSTOM_STICKER_MAX_PER_OWNER,
} from "@/features/chat/utils/custom-sticker-rules";
import {
  encodeStickerImage,
  StickerImageError,
} from "@/features/chat/utils/encode-sticker-image";
import { useLocalizeMessage } from "@/i18n/use-localize-message";

const BASE_URL = "/api/chat/stickers/custom";

export interface CustomStickerItem {
  id: number;
  url: string;
}

export type CustomStickersStatus = "loading" | "ready" | "error";

const isItem = (value: unknown): value is CustomStickerItem => {
  const item = value as Partial<CustomStickerItem> | null;

  return typeof item?.id === "number" && typeof item.url === "string";
};

const readMessage = async (response: Response) => {
  const data: { message?: unknown } | null = await response
    .json()
    .catch(() => null);

  return typeof data?.message === "string"
    ? data.message
    : CUSTOM_STICKER_ERRORS.GENERIC;
};

// My personal stickers (KAN-158): the list, adding a picked photo (resized and
// re-encoded here first) and removing one. `role` picks the session the routes
// use, since a browser may hold a trainee and a PT cookie at once.
export const useCustomStickers = (role: "user" | "admin") => {
  const localize = useLocalizeMessage();
  const query = role === "admin" ? "?as=admin" : "";
  const [stickers, setStickers] = useState<CustomStickerItem[]>([]);
  const [status, setStatus] = useState<CustomStickersStatus>("loading");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(`${BASE_URL}${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: { stickers?: unknown } | null = await response
          .json()
          .catch(() => null);

        if (response.ok && Array.isArray(data?.stickers)) {
          setStickers(data.stickers.filter(isItem));
          setStatus("ready");
          return;
        }
        setStatus("error");
      } catch {
        if (!controller.signal.aborted) {
          setStatus("error");
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [query]);

  const add = useCallback(
    async (file: File): Promise<CustomStickerItem | null> => {
      if (stickers.length >= CUSTOM_STICKER_MAX_PER_OWNER) {
        setError(CUSTOM_STICKER_ERRORS.LIMIT);
        return null;
      }
      setIsBusy(true);
      setError(null);
      try {
        const image = await encodeStickerImage(file);
        const response = await fetch(`${BASE_URL}${query}`, {
          method: "POST",
          headers: { "Content-Type": image.type },
          body: image,
        });

        if (!response.ok) {
          setError(await readMessage(response));
          return null;
        }
        const data: { sticker?: unknown } | null = await response
          .json()
          .catch(() => null);

        if (!isItem(data?.sticker)) {
          setError(CUSTOM_STICKER_ERRORS.GENERIC);
          return null;
        }
        const created = data.sticker;

        setStickers((current) => [created, ...current]);
        return created;
      } catch (caught) {
        setError(
          caught instanceof StickerImageError
            ? caught.message
            : CUSTOM_STICKER_ERRORS.GENERIC,
        );
        return null;
      } finally {
        setIsBusy(false);
      }
    },
    [query, stickers.length],
  );

  const remove = useCallback(
    async (id: number) => {
      setError(null);
      try {
        const response = await fetch(`${BASE_URL}/${id}${query}`, {
          method: "DELETE",
        });

        // 404 means it is already gone: the list is right either way.
        if (response.ok || response.status === 404) {
          setStickers((current) => current.filter((item) => item.id !== id));
          return;
        }
        setError(await readMessage(response));
      } catch {
        setError(CUSTOM_STICKER_ERRORS.GENERIC);
      }
    },
    [query],
  );

  return {
    stickers,
    status,
    isBusy,
    error: error === null ? null : localize(error),
    add,
    remove,
  };
};
