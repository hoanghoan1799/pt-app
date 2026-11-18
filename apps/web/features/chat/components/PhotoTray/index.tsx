"use client";

import { ImagePlus, RotateCw, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Spinner } from "@/components/common/Spinner";
import type { MessagePhotos } from "@/features/chat/hooks/use-message-photos";
import { MAX_MESSAGE_PHOTOS } from "@/features/chat/utils/photo-rules";

interface PhotoTrayProps {
  photos: MessagePhotos;
  // Opens the file picker (the composer owns the input).
  onAdd: () => void;
}

// The photos picked for a message: a thumbnail strip with a spinner, a retry
// or an X on each, and a "+" tile while there is room (up to 10).
export const PhotoTray = ({ photos, onAdd }: PhotoTrayProps) => {
  const t = useTranslations("chat.photoTray");

  if (photos.items.length === 0) {
    return null;
  }
  return (
    <div className="mx-4 mb-2">
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-2 pb-1">
        {photos.items.map((item, index) => (
          <li
            key={item.key}
            className="relative size-16 shrink-0 rounded-xl bg-line"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, nothing for next/image to optimise */}
            <img
              src={item.previewUrl}
              alt={t("photoAltN", { index: index + 1 })}
              className="size-full rounded-xl border border-line object-cover"
            />
            {item.status === "uploading" && (
              <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 text-white">
                <Spinner label={t("uploading")} />
              </span>
            )}
            {item.status === "error" && (
              <span
                role="alert"
                title={item.error ?? t("failed")}
                className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-white"
              >
                {item.canRetry ? (
                  <button
                    type="button"
                    onClick={() => photos.retry(item.key)}
                    aria-label={`${t("failed")}. ${t("retry")}`}
                    className="flex size-full items-center justify-center"
                  >
                    <RotateCw className="size-5" aria-hidden />
                  </button>
                ) : (
                  <span className="px-1 text-center text-[10px] font-semibold">
                    {t("failed")}
                  </span>
                )}
              </span>
            )}
            <button
              type="button"
              aria-label={t("removePhoto")}
              onClick={() => photos.remove(item.key)}
              className="absolute -top-2 -right-2 inline-flex size-6 items-center justify-center rounded-full bg-fg text-bg shadow active:scale-90"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
        {!photos.isFull && (
          <li className="shrink-0">
            <button
              type="button"
              onClick={onAdd}
              aria-label={t("addMore")}
              className="flex size-16 items-center justify-center rounded-xl border-2 border-dashed border-line text-accent transition active:bg-line/70"
            >
              <ImagePlus className="size-6" aria-hidden />
            </button>
          </li>
        )}
      </ul>
      <p className="mt-1 text-xs text-muted">
        {t("counter", { count: photos.items.length, max: MAX_MESSAGE_PHOTOS })}
      </p>
    </div>
  );
};
