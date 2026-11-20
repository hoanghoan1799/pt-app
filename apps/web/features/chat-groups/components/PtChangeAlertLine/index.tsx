"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Spinner } from "@/components/common/Spinner";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/constants/styles";
import { resolvePtChangeAlertAction } from "@/features/chat-groups/services/group-actions";
import { useLocalizeMessage } from "@/i18n/use-localize-message";

interface PtChangeAlertLineProps {
  groupId: number;
  messageId: number;
  // The line's words (already built from the event).
  text: string;
  // Called after a choice was stored or found already handled, so the thread
  // fetches the resolved line.
  onChanged: () => void;
}

// The open PT-change alert, seen by super admins only: the line, who may see
// it, and "Keep" / "Remove from group". A second tap, or a second super admin,
// is told who handled it first.
export const PtChangeAlertLine = ({
  groupId,
  messageId,
  text,
  onChanged,
}: PtChangeAlertLineProps) => {
  const t = useTranslations("chatGroups.alert");
  const localize = useLocalizeMessage();
  const [isPending, startTransition] = useTransition();
  const [choice, setChoice] = useState<"keep" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolve = (next: "keep" | "remove") => {
    setChoice(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await resolvePtChangeAlertAction({
          groupId,
          messageId,
          choice: next,
        });

        if (result.status === "success") {
          onChanged();
          return;
        }
        const handledBy =
          "handledBy" in result && typeof result.handledBy === "string"
            ? result.handledBy
            : null;

        setError(
          handledBy
            ? t("handledBy", { name: handledBy })
            : localize(result.message),
        );
        // Someone else resolved it: show that line instead of the buttons.
        if ("handledBy" in result) {
          onChanged();
        }
      } catch {
        setError(t("failed"));
      }
    });
  };

  return (
    <div
      role="group"
      aria-label={text}
      className="mx-2 my-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3 text-center"
    >
      <p className="text-sm font-medium text-fg">{text}</p>
      <p className="mt-1 text-xs text-muted">{t("badge")}</p>
      <p className="mt-2 text-sm text-fg">{t("question")}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          aria-busy={isPending && choice === "keep"}
          onClick={() => resolve("keep")}
          className={`${BUTTON_PRIMARY} min-h-11 flex-1 px-3 text-sm`}
        >
          {isPending && choice === "keep" && <Spinner size="sm" />}
          {t("keep")}
        </button>
        <button
          type="button"
          disabled={isPending}
          aria-busy={isPending && choice === "remove"}
          onClick={() => resolve("remove")}
          className={`${BUTTON_SECONDARY} min-h-11 flex-1 px-3 text-sm`}
        >
          {isPending && choice === "remove" && <Spinner size="sm" />}
          {t("remove")}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
};
