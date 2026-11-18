"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import type { SentPhoto } from "@/features/chat/hooks/use-chat-messages";
import {
  encodePhoto,
  PhotoImageError,
  type PreparedPhoto,
} from "@/features/chat/utils/encode-photo";
import {
  MAX_MESSAGE_PHOTOS,
  MESSAGE_PHOTO_UPLOAD_CONCURRENCY,
  PHOTO_ERRORS,
  photoSlots,
} from "@/features/chat/utils/photo-rules";
import { usePhotoUploads } from "@/hooks/use-photo-uploads";
import { useLocalizeMessage } from "@/i18n/use-localize-message";

// The photos picked for one message (chat, group chat and DM composers): each
// is resized in the browser and uploaded as soon as it is picked, at most 3 at
// a time, with its own status. `ready()` gives the uploaded ones in the order
// they were picked, with the resized image the sending bubble shows.
export const useMessagePhotos = (upload: (blob: Blob) => Promise<number>) => {
  const t = useTranslations("chat.photoTray");
  const localize = useLocalizeMessage();
  const prepared = useRef(new Map<Blob, PreparedPhoto>());
  const byId = useRef(new Map<number, PreparedPhoto>());
  const uploadRef = useRef(upload);

  useEffect(() => {
    uploadRef.current = upload;
  });

  const photos = usePhotoUploads({
    max: MAX_MESSAGE_PHOTOS,
    concurrency: MESSAGE_PHOTO_UPLOAD_CONCURRENCY,
    prepare: async (file) => {
      const result = await encodePhoto(file);

      prepared.current.set(result.blob, result);
      return result.blob;
    },
    upload: async (blob) => {
      const id = await uploadRef.current(blob);
      const result = prepared.current.get(blob);

      if (result) {
        byId.current.set(id, result);
      }
      return id;
    },
    isFatal: (error) => error instanceof PhotoImageError,
    messageOf: (error) =>
      localize(
        error instanceof Error && error.message
          ? error.message
          : PHOTO_ERRORS.GENERIC,
      ),
  });
  const { add, reset: resetUploads } = photos;

  // Adds the picked files; the ones that do not fit are dropped with a note.
  const pick = useCallback(
    (list: FileList | null) => {
      const files = Array.from(list ?? []);

      if (files.length === 0) {
        return;
      }
      const { accepted } = photoSlots(photos.items.length, files.length);
      const dropped = add(files);

      if (dropped > 0) {
        toast.error(
          accepted > 0
            ? t("trimmed", { count: accepted, max: MAX_MESSAGE_PHOTOS })
            : t("slotsFull", { max: MAX_MESSAGE_PHOTOS }),
        );
      }
    },
    [add, photos.items.length, t],
  );

  const reset = useCallback(() => {
    resetUploads();
    prepared.current.clear();
    byId.current.clear();
  }, [resetUploads]);

  const isUploading = photos.items.some((item) => item.status === "uploading");
  const hasFailed = photos.items.some((item) => item.status === "error");

  // The uploaded photos in picked order.
  const ready = (): SentPhoto[] =>
    photos.items.flatMap((item) => {
      const result = item.id === null ? undefined : byId.current.get(item.id);

      return item.id !== null && result
        ? [{ ...result, photoId: item.id }]
        : [];
    });

  return {
    items: photos.items,
    retry: photos.retry,
    remove: photos.remove,
    pick,
    reset,
    ready,
    isFull: photos.items.length >= MAX_MESSAGE_PHOTOS,
    isUploading,
    hasFailed,
    // Something is being uploaded or has failed: sending must wait.
    isBlocked: isUploading || hasFailed,
  };
};

export type MessagePhotos = ReturnType<typeof useMessagePhotos>;
