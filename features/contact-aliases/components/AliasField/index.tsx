"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Input } from "@/components/common/Input";
import { Spinner } from "@/components/common/Spinner";
import { BUTTON_PRIMARY, FIELD_ERROR } from "@/constants/styles";
import {
  ALIAS_MAX_LENGTH,
  aliasLength,
  canSaveAlias,
} from "@/features/contact-aliases/utils/alias-rules";
import { cn } from "@/utils/cn";

interface AliasFieldProps {
  id: string;
  label: string;
  // The key the save callback receives back ("user:<id>", "pt", …).
  targetKey: string;
  // Shown as the placeholder while there is no nickname.
  realName: string;
  // The saved nickname, if any.
  saved: string | undefined;
  disabled?: boolean;
  // Resolves to an error message, or null when saved.
  onSave: (targetKey: string, alias: string) => Promise<string | null>;
}

// One private nickname: input with a counter, Save and Clear. The draft
// restarts whenever the saved value changes (the parent keys it on the value).
// Used by the chat settings and the profile pages alike.
export const AliasField = ({
  id,
  label,
  targetKey,
  realName,
  saved,
  disabled = false,
  onSave,
}: AliasFieldProps) => {
  const t = useTranslations("common.alias");
  const [draft, setDraft] = useState(saved ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const length = aliasLength(draft.trim());
  const tooLong = length > ALIAS_MAX_LENGTH;
  const canSave = canSaveAlias(draft, saved);

  const save = (value: string) => {
    setError(null);
    startTransition(async () => {
      setError(await onSave(targetKey, value));
    });
  };

  return (
    <div data-nickname-target={targetKey}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={realName}
          autoComplete="off"
          disabled={disabled || isPending}
          invalid={tooLong}
          aria-describedby={`${id}-count ${id}-hint`}
          wrapperClassName="min-w-0 flex-1"
          onKeyDown={(event) => {
            if (event.key === "Enter" && canSave) {
              event.preventDefault();
              save(draft);
            }
          }}
        />
        <button
          type="button"
          disabled={disabled || isPending || !canSave}
          aria-busy={isPending}
          onClick={() => save(draft)}
          className={cn(BUTTON_PRIMARY, "shrink-0 px-4")}
        >
          {isPending && <Spinner size="sm" />}
          {isPending ? t("saving") : t("save")}
        </button>
      </div>
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
        {t("privateHint")}
      </p>
      <div className="flex min-h-9 items-center justify-between gap-3">
        <span
          id={`${id}-count`}
          className={cn(
            "text-xs",
            tooLong ? "font-semibold text-danger" : "text-muted",
          )}
        >
          {length}/{ALIAS_MAX_LENGTH}
        </span>
        {saved && (
          <button
            type="button"
            disabled={disabled || isPending}
            aria-busy={isPending}
            onClick={() => {
              setDraft("");
              save("");
            }}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted transition active:bg-line disabled:opacity-50"
          >
            {isPending && <Spinner size="sm" />}
            {t("clear")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      )}
    </div>
  );
};
