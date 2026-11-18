"use client";

import { ImagePlus, RotateCw, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { Spinner } from "@/components/common/Spinner";
import { SubmitButton } from "@/components/common/SubmitButton";
import { CARD } from "@/constants/styles";
import {
  encodePhoto,
  PhotoImageError,
} from "@/features/chat/utils/encode-photo";
import { PHOTO_ERRORS } from "@/features/chat/utils/photo-rules";
import { PrivacySelect } from "@/features/social/components/PrivacySelect";
import {
  CAPTION_MAX_LENGTH,
  MAX_POST_PHOTOS,
  POST_PHOTO_UPLOAD_CONCURRENCY,
} from "@/features/social/constants/social";
import { createPostAction } from "@/features/social/services/social-actions";
import type { PostPrivacy } from "@/features/social/types/social";
import { usePhotoUploads } from "@/hooks/use-photo-uploads";
import { useLocalizeMessage } from "@/i18n/use-localize-message";
import { cn } from "@/utils/cn";
import { describeErrorReference } from "@/utils/errors";

interface PostComposerProps {
  mode: "user" | "admin";
  defaultPrivacy: PostPrivacy;
  // The signed-in person, shown beside the caption; no avatar when omitted.
  viewerName?: string;
  viewerAvatarUrl?: string | null;
}

const uploadPhoto = async (blob: Blob, mode: "user" | "admin") => {
  let response: Response;

  try {
    response = await fetch(
      `/api/social/photos${mode === "admin" ? "?as=admin" : ""}`,
      { method: "POST", body: blob },
    );
  } catch {
    throw new Error(PHOTO_ERRORS.GENERIC);
  }
  const data = (await response.json().catch(() => null)) as {
    photo?: { id?: number };
    message?: string;
  } | null;

  if (!response.ok || typeof data?.photo?.id !== "number") {
    throw new Error(data?.message ?? PHOTO_ERRORS.GENERIC);
  }
  return data.photo.id;
};

// Write a post: caption, up to MAX_POST_PHOTOS photos and the privacy (which
// starts from the last one the person chose).
export const PostComposer = ({
  mode,
  defaultPrivacy,
  viewerName,
  viewerAvatarUrl = null,
}: PostComposerProps) => {
  const t = useTranslations("social.postComposer");
  const localize = useLocalizeMessage();
  const router = useRouter();
  const captionId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [privacy, setPrivacy] = useState<PostPrivacy>(defaultPrivacy);
  const [isFocused, setFocused] = useState(false);
  const isExpanded = isFocused || caption !== "";
  const [isPending, startTransition] = useTransition();

  const photos = usePhotoUploads({
    max: MAX_POST_PHOTOS,
    concurrency: POST_PHOTO_UPLOAD_CONCURRENCY,
    prepare: async (file) => (await encodePhoto(file)).blob,
    upload: (blob) => uploadPhoto(blob, mode),
    isFatal: (error) => error instanceof PhotoImageError,
    messageOf: (error) =>
      localize(
        error instanceof Error && error.message
          ? error.message
          : PHOTO_ERRORS.GENERIC,
      ),
  });
  const isFull = photos.items.length >= MAX_POST_PHOTOS;
  const isUploading = photos.items.some((item) => item.status === "uploading");
  const hasFailed = photos.items.some((item) => item.status === "error");

  const handlePick = (list: FileList | null) => {
    const picked = Array.from(list ?? []);

    if (picked.length === 0) {
      return;
    }
    const free = MAX_POST_PHOTOS - photos.items.length;
    const dropped = photos.add(picked);

    if (dropped > 0) {
      toast.error(
        free > 0
          ? t("photosTrimmed", { count: free, max: MAX_POST_PHOTOS })
          : t("photoSlotsFull", { max: MAX_POST_PHOTOS }),
      );
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (caption.trim() === "" && photos.items.length === 0) {
      toast.error(t("emptyPost"));
      return;
    }
    if (isUploading || hasFailed) {
      toast.error(t("photosPending"));
      return;
    }
    const photoIds = photos.items.flatMap((item) =>
      item.id === null ? [] : [item.id],
    );

    startTransition(async () => {
      try {
        // One key per submit: if the answer is lost and the same submit is
        // sent again, the API returns the first post instead of a second one.
        const result = await createPostAction(
          mode,
          { caption, privacy, photoIds },
          crypto.randomUUID(),
        );

        if (result.status === "error") {
          toast.error(result.message, {
            description: describeErrorReference(result.reference),
          });
          return;
        }
        setCaption("");
        photos.reset();
        router.refresh();
      } catch (error) {
        toast.error(
          localize(
            error instanceof Error ? error.message : PHOTO_ERRORS.GENERIC,
          ),
        );
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className={`${CARD} space-y-3 p-4`}>
      <div className="flex items-start gap-3">
        {viewerName !== undefined && (
          <Avatar
            name={viewerName}
            src={viewerAvatarUrl}
            className="size-11 text-sm"
          />
        )}
        <div className="min-w-0 flex-1">
          <label htmlFor={captionId} className="sr-only">
            {t("captionLabel")}
          </label>
          <textarea
            id={captionId}
            value={caption}
            maxLength={CAPTION_MAX_LENGTH}
            onChange={(event) => setCaption(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t("placeholder")}
            rows={1}
            className={cn(
              "block w-full resize-none border border-line bg-bg px-4 text-base text-fg transition-[min-height,border-radius] placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none",
              isExpanded
                ? "min-h-24 rounded-2xl py-3"
                : "min-h-11 rounded-full py-2.5",
            )}
          />
        </div>
      </div>
      {photos.items.length > 0 && (
        <div>
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {photos.items.map((item, index) => (
              <li
                key={item.key}
                className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-line"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={t("photoAltN", { index: index + 1 })}
                  className="size-full object-cover"
                />
                {item.status === "uploading" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                    <Spinner label={t("photoUploading")} />
                  </span>
                )}
                {item.status === "error" && (
                  <span
                    role="alert"
                    title={item.error ?? t("photoFailed")}
                    className="absolute inset-0 flex items-center justify-center bg-black/60 text-white"
                  >
                    {item.canRetry ? (
                      <button
                        type="button"
                        onClick={() => photos.retry(item.key)}
                        aria-label={`${t("photoFailed")}. ${t("retryPhoto")}`}
                        className="flex size-full min-h-11 min-w-11 flex-col items-center justify-center gap-1 text-xs font-semibold"
                      >
                        <RotateCw className="size-5" aria-hidden />
                        {t("retryPhoto")}
                      </button>
                    ) : (
                      <span className="px-1 text-center text-xs font-semibold">
                        {t("photoFailed")}
                      </span>
                    )}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => photos.remove(item.key)}
                  aria-label={t("removePhoto")}
                  className="absolute top-0 right-0 flex size-11 items-start justify-end p-1"
                >
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-black/60 text-white">
                    <X className="size-4" aria-hidden />
                  </span>
                </button>
              </li>
            ))}
            {!isFull && (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  aria-label={t("addMorePhotos")}
                  className="flex size-24 items-center justify-center rounded-xl border-2 border-dashed border-line text-accent transition active:bg-line/70"
                >
                  <ImagePlus className="size-6" aria-hidden />
                </button>
              </li>
            )}
          </ul>
          <p className="mt-1 text-xs text-muted">
            {t("photoCounter", {
              count: photos.items.length,
              max: MAX_POST_PHOTOS,
            })}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            handlePick(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() =>
            isFull
              ? toast.error(t("photoSlotsFull", { max: MAX_POST_PHOTOS }))
              : fileRef.current?.click()
          }
          disabled={isPending}
          aria-label={t("addPhoto")}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted transition active:bg-line/70 disabled:opacity-50"
        >
          <ImagePlus className="size-5 text-accent" aria-hidden />
          {t("photo")}
        </button>
        <PrivacySelect
          id={`${captionId}-privacy`}
          value={privacy}
          onChange={setPrivacy}
          disabled={isPending}
        />
        <SubmitButton
          isPending={isPending}
          className="ml-auto inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          <Send className="size-4" aria-hidden />
          {t("submit")}
        </SubmitButton>
      </div>
    </form>
  );
};
