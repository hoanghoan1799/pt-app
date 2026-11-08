"use client";

import { Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { BUTTON_PRIMARY, BUTTON_SECONDARY, TEXTAREA } from "@/constants/styles";
import { BIO_MAX_LENGTH } from "@/features/social/constants/social";
import { updateBioAction } from "@/features/social/services/social-actions";
import { describeErrorReference } from "@/utils/errors";

interface BioEditorProps {
  mode: "user" | "admin";
  bio: string;
}

// Own profile only: shows the bio with an edit button.
export const BioEditor = ({ mode, bio }: BioEditorProps) => {
  const router = useRouter();
  const fieldId = useId();
  const [isEditing, setEditing] = useState(false);
  const [value, setValue] = useState(bio);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateBioAction(mode, value);

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  if (!isEditing) {
    return (
      <div className="flex items-start justify-center gap-1">
        <p className="text-sm break-words whitespace-pre-wrap text-muted">
          {bio || "Chưa có giới thiệu"}
        </p>
        <button
          type="button"
          onClick={() => {
            setValue(bio);
            setEditing(true);
          }}
          aria-label="Sửa giới thiệu"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted active:bg-line"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-left">
      <label htmlFor={fieldId} className="sr-only">
        Giới thiệu
      </label>
      <textarea
        id={fieldId}
        value={value}
        maxLength={BIO_MAX_LENGTH}
        onChange={(event) => setValue(event.target.value)}
        className={TEXTAREA}
      />
      <p className="text-right text-xs text-muted">
        {value.length}/{BIO_MAX_LENGTH}
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={isPending}
          className={`${BUTTON_SECONDARY} min-h-11`}
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className={`${BUTTON_PRIMARY} min-h-11`}
        >
          {isPending && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Lưu
        </button>
      </div>
    </div>
  );
};
