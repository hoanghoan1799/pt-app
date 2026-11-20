"use client";

import { blockUserSchema } from "@pt/contracts";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";

import { blockUserAction } from "@/features/restrictions/services/restriction-actions";
import type {
  RestrictionDuration,
  RestrictionLevel,
} from "@/features/restrictions/types/restriction";
import { useLocalizeMessage } from "@/i18n/use-localize-message";

interface UseBlockUserOptions {
  userId: number;
  // Called after the block is saved (close the sheet, refresh the page).
  onBlocked: () => void;
}

// Form state of the block sheet: level, duration, reason and the submit.
export const useBlockUser = ({ userId, onBlocked }: UseBlockUserOptions) => {
  const t = useTranslations("restrictions.sheet");
  const localize = useLocalizeMessage();
  const [level, setLevel] = useState<RestrictionLevel>("restricted");
  const [duration, setDuration] = useState<RestrictionDuration>("7d");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = blockUserSchema.safeParse({
      userId,
      level,
      duration,
      reason,
    });

    if (!parsed.success) {
      setError(localize(parsed.error.issues[0]?.message ?? t("failed")));
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await blockUserAction(parsed.data);

        if (result.status === "error") {
          setError(result.message);
          return;
        }
        toast.success(t("blocked"));
        setReason("");
        onBlocked();
      } catch {
        setError(t("failed"));
      }
    });
  };

  return {
    level,
    setLevel,
    duration,
    setDuration,
    reason,
    setReason,
    error,
    isPending,
    submit,
  };
};
