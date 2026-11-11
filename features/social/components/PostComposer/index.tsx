"use client";

import { ImagePlus, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { SubmitButton } from "@/components/common/SubmitButton";
import { CARD } from "@/constants/styles";
import {
  encodePhoto,
  PhotoImageError,
} from "@/features/chat/utils/encode-photo";
import { PHOTO_ERRORS } from "@/features/chat/utils/photo-rules";
import { PrivacySelect } from "@/features/social/components/PrivacySelect";
import { CAPTION_MAX_LENGTH } from "@/features/social/constants/social";
import { createPostAction } from "@/features/social/services/social-actions";
import type { PostPrivacy } from "@/features/social/types/social";
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

interface Attached {
  blob: Blob;
  previewUrl: string;
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

// Write a post: caption, at most one photo and the privacy (which starts from
// the last one the person chose).
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
  const [photo, setPhoto] = useState<Attached | null>(null);
  const [isFocused, setFocused] = useState(false);
  const isExpanded = isFocused || caption !== "";
  const [isPending, startTransition] = useTransition();

  useEffect(
    () => () => {
      if (photo) {
        URL.revokeObjectURL(photo.previewUrl);
      }
    },
    [photo],
  );

  const handlePick = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    try {
      const prepared = await encodePhoto(file);

      setPhoto({
        blob: prepared.blob,
        previewUrl: URL.createObjectURL(prepared.blob),
      });
    } catch (error) {
      toast.error(
        localize(
          error instanceof PhotoImageError
            ? error.message
            : PHOTO_ERRORS.GENERIC,
        ),
      );
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (caption.trim() === "" && !photo) {
      toast.error(t("emptyPost"));
      return;
    }
    startTransition(async () => {
      try {
        const photoId = photo ? await uploadPhoto(photo.blob, mode) : null;
        const result = await createPostAction(mode, {
          caption,
          privacy,
          photoId,
        });

        if (result.status === "error") {
          toast.error(result.message, {
            description: describeErrorReference(result.reference),
          });
          return;
        }
        setCaption("");
        setPhoto(null);
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
      {photo && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.previewUrl}
            alt={t("photoAlt")}
            className="max-h-64 w-full rounded-xl object-cover"
          />
          <button
            type="button"
            onClick={() => setPhoto(null)}
            aria-label={t("removePhoto")}
            className="absolute top-2 right-2 inline-flex size-9 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            void handlePick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
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
