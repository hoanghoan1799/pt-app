"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Spinner } from "@/components/common/Spinner";
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
  const t = useTranslations("social.bio");
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
      <div className="flex items-start justify-start gap-1">
        <p className="text-sm break-words whitespace-pre-wrap text-muted">
          {bio || t("empty")}
        </p>
        <button
          type="button"
          onClick={() => {
            setValue(bio);
            setEditing(true);
          }}
          aria-label={t("edit")}
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
        {t("label")}
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
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          aria-busy={isPending}
          className={`${BUTTON_PRIMARY} min-h-11`}
        >
          {isPending && <Spinner size="md" />}
          {t("save")}
        </button>
      </div>
    </div>
  );
};
