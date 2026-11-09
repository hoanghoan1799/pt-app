"use client";

import { ImagePlus, X } from "lucide-react";
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

import { Spinner } from "@/components/common/Spinner";
import { BUTTON_PRIMARY, CARD, TEXTAREA } from "@/constants/styles";
import {
  encodePhoto,
  PhotoImageError,
} from "@/features/chat/utils/encode-photo";
import { PHOTO_ERRORS } from "@/features/chat/utils/photo-rules";
import { PrivacySelect } from "@/features/social/components/PrivacySelect";
import { CAPTION_MAX_LENGTH } from "@/features/social/constants/social";
import { createPostAction } from "@/features/social/services/social-actions";
import type { PostPrivacy } from "@/features/social/types/social";
import { describeErrorReference } from "@/utils/errors";

interface PostComposerProps {
  mode: "user" | "admin";
  defaultPrivacy: PostPrivacy;
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
export const PostComposer = ({ mode, defaultPrivacy }: PostComposerProps) => {
  const t = useTranslations("social.postComposer");
  const router = useRouter();
  const captionId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [privacy, setPrivacy] = useState<PostPrivacy>(defaultPrivacy);
  const [photo, setPhoto] = useState<Attached | null>(null);
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
        error instanceof PhotoImageError ? error.message : PHOTO_ERRORS.GENERIC,
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
          error instanceof Error ? error.message : PHOTO_ERRORS.GENERIC,
        );
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className={`${CARD} space-y-3 p-4`}>
      <label htmlFor={captionId} className="sr-only">
        {t("captionLabel")}
      </label>
      <textarea
        id={captionId}
        value={caption}
        maxLength={CAPTION_MAX_LENGTH}
        onChange={(event) => setCaption(event.target.value)}
        placeholder={t("placeholder")}
        className={TEXTAREA}
      />
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
      <div className="flex items-center gap-2">
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
          className="inline-flex size-11 items-center justify-center rounded-xl border border-line text-accent disabled:opacity-50"
        >
          <ImagePlus className="size-5" aria-hidden />
        </button>
        <PrivacySelect
          id={`${captionId}-privacy`}
          value={privacy}
          onChange={setPrivacy}
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending}
          className={`${BUTTON_PRIMARY} ml-auto min-h-11`}
        >
          {isPending && <Spinner size="md" />}
          {t("submit")}
        </button>
      </div>
    </form>
  );
};
