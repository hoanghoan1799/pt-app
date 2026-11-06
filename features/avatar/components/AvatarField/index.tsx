"use client";

import clsx from "clsx";
import { useRef, useState, useTransition } from "react";

import { Avatar } from "@/components/common/Avatar";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_ERROR,
} from "@/constants/styles";
import {
  removeAdminAvatarAction,
  removeUserAvatarAction,
  setAdminAvatarAction,
  setUserAvatarAction,
} from "@/features/avatar/services/avatar-actions";
import { resizeToAvatarDataUrl } from "@/features/avatar/utils/resize-avatar";

const FAILED_TEXT = "Không lưu được ảnh. Thử lại nhé.";
const UNREADABLE_TEXT = "Không đọc được ảnh này. Chọn ảnh khác nhé.";

interface AvatarFieldProps {
  role: "user" | "admin";
  // The person's name, for the initials fallback.
  name: string;
  // Saved photo (versioned URL) or null.
  savedUrl: string | null;
  onSaved: (url: string | null) => void;
}

// Own profile photo: pick (accept image/*), preview the 256x256 crop, save or
// remove. The browser resizes; the server validates again.
export const AvatarField = ({
  role,
  name,
  savedUrl,
  onSaved,
}: AvatarFieldProps) => {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pick = async (file: File | undefined) => {
    setError(null);
    if (!file) {
      return;
    }
    try {
      setPreview(await resizeToAvatarDataUrl(file));
    } catch {
      setPreview(null);
      setError(UNREADABLE_TEXT);
    }
  };

  const reset = () => {
    setPreview(null);
    if (input.current) {
      input.current.value = "";
    }
  };

  const save = () => {
    if (!preview) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await (role === "admin"
          ? setAdminAvatarAction({ dataUrl: preview })
          : setUserAvatarAction({ dataUrl: preview }));

        if (result.status === "success") {
          onSaved(result.avatarUrl);
          reset();
        } else {
          setError(result.message ?? FAILED_TEXT);
        }
      } catch {
        setError(FAILED_TEXT);
      }
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await (role === "admin"
          ? removeAdminAvatarAction()
          : removeUserAvatarAction());

        if (result.status === "success") {
          onSaved(null);
          reset();
        } else {
          setError(result.message ?? FAILED_TEXT);
        }
      } catch {
        setError(FAILED_TEXT);
      }
    });
  };

  return (
    <div data-avatar-field className="space-y-3">
      <div className="flex items-center gap-4">
        <Avatar
          name={name}
          src={preview ?? savedUrl}
          className="size-16 text-xl"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            id="avatar-file"
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={isPending}
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <label
            htmlFor="avatar-file"
            className={clsx(
              BUTTON_SECONDARY,
              "min-h-10 cursor-pointer px-4 text-sm",
              isPending && "pointer-events-none opacity-50",
            )}
          >
            Chọn ảnh
          </label>
          {preview && (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={save}
                className={clsx(BUTTON_PRIMARY, "min-h-10 px-4 text-sm")}
              >
                {isPending ? "Đang lưu…" : "Lưu ảnh"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={reset}
                className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-muted transition active:bg-line disabled:opacity-50"
              >
                Huỷ
              </button>
            </>
          )}
          {!preview && savedUrl && (
            <button
              type="button"
              disabled={isPending}
              onClick={remove}
              className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-muted transition active:bg-line disabled:opacity-50"
            >
              Xoá ảnh
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      )}
    </div>
  );
};
