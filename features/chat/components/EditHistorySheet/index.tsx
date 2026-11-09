"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { Spinner } from "@/components/common/Spinner";
import { formatSentAt } from "@/features/chat/utils/chat-thread-rules";

interface EditHistorySheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // Route that lists the previous bodies; null while no message is chosen.
  editsUrl: string | null;
  // The body as it reads now.
  currentBody: string;
}

interface EditEntry {
  previousBody: string;
  editedAt: string;
}

type HistoryState =
  | { url: string; status: "loading" }
  | { url: string; status: "error" }
  | { url: string; status: "ready"; edits: EditEntry[] };

const isEditEntry = (value: unknown): value is EditEntry =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as EditEntry).previousBody === "string" &&
  typeof (value as EditEntry).editedAt === "string";

// Previous versions of an edited message, newest first, under the current one.
export const EditHistorySheet = ({
  isOpen,
  onOpenChange,
  editsUrl,
  currentBody,
}: EditHistorySheetProps) => {
  const locale = useLocale();
  const t = useTranslations("chat.editHistory");
  const [state, setState] = useState<HistoryState | null>(null);

  useEffect(() => {
    if (!isOpen || editsUrl === null) {
      return;
    }
    const controller = new AbortController();

    fetch(editsUrl, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data: unknown = response.ok ? await response.json() : null;
        const edits =
          typeof data === "object" &&
          data !== null &&
          Array.isArray((data as { edits?: unknown }).edits)
            ? (data as { edits: unknown[] }).edits.filter(isEditEntry)
            : null;

        setState(
          edits
            ? { url: editsUrl, status: "ready", edits }
            : { url: editsUrl, status: "error" },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ url: editsUrl, status: "error" });
        }
      });
    return () => controller.abort();
  }, [isOpen, editsUrl]);

  // A result for another message (or an earlier open) counts as loading.
  const current = state?.url === editsUrl ? state : null;

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange} title={t("title")}>
      {current?.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {t("error")}
        </p>
      )}
      {(current === null || current.status === "loading") && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          {t("loading")}
        </p>
      )}
      {current?.status === "ready" && (
        <ul className="flex flex-col gap-2">
          <li className="rounded-2xl border border-accent bg-surface px-3.5 py-2.5">
            <p className="text-xs font-semibold text-accent">{t("current")}</p>
            <p className="mt-0.5 text-[15px] break-words whitespace-pre-wrap text-fg">
              {currentBody}
            </p>
          </li>
          {[...current.edits].reverse().map((edit) => (
            <li
              key={edit.editedAt}
              className="rounded-2xl border border-line bg-surface px-3.5 py-2.5"
            >
              <p className="text-xs text-muted">
                {t("previous", { time: formatSentAt(edit.editedAt, locale) })}
              </p>
              <p className="mt-0.5 text-[15px] break-words whitespace-pre-wrap text-fg">
                {edit.previousBody}
              </p>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
};
