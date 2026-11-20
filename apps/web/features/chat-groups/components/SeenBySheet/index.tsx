"use client";

import { GROUP_ROLES, type GroupRole } from "@pt/contracts";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { Spinner } from "@/components/common/Spinner";

interface SeenByEntry {
  key: string;
  role: GroupRole;
  name: string;
}

type SeenState =
  | { url: string; status: "error" }
  | { url: string; status: "ready"; seenBy: SeenByEntry[] };

const ROLES: ReadonlySet<string> = new Set(GROUP_ROLES);

const isEntry = (value: unknown): value is SeenByEntry =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as SeenByEntry).key === "string" &&
  typeof (value as SeenByEntry).name === "string" &&
  ROLES.has((value as SeenByEntry).role);

interface SeenBySheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // The "seen" route of the message; null while none is chosen.
  url: string | null;
}

const ROLE_KEY = {
  super_admin: "role.manager",
  pt: "role.pt",
  trainee: "role.trainee",
} as const;

// "Seen by N": who read up to one of my messages, with their role.
export const SeenBySheet = ({
  isOpen,
  onOpenChange,
  url,
}: SeenBySheetProps) => {
  const t = useTranslations("chatGroups");
  const [state, setState] = useState<SeenState | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isOpen || url === null) {
      return;
    }
    const controller = new AbortController();

    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data: unknown = response.ok ? await response.json() : null;
        const list =
          typeof data === "object" &&
          data !== null &&
          Array.isArray((data as { seenBy?: unknown }).seenBy)
            ? (data as { seenBy: unknown[] }).seenBy.filter(isEntry)
            : null;

        setState(
          list
            ? { url, status: "ready", seenBy: list }
            : { url, status: "error" },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ url, status: "error" });
        }
      });
    return () => controller.abort();
  }, [isOpen, url, attempt]);

  const current = state?.url === url ? state : null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("seenBy.title")}
      description={t("seenBy.description")}
    >
      {current === null && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
        </p>
      )}
      {current?.status === "error" && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-danger">{t("seenBy.failed")}</p>
          <button
            type="button"
            onClick={() => {
              setState(null);
              setAttempt((count) => count + 1);
            }}
            className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold"
          >
            {t("seenBy.retry")}
          </button>
        </div>
      )}
      {current?.status === "ready" &&
        (current.seenBy.length === 0 ? (
          <p className="text-sm text-muted">{t("seenBy.empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {current.seenBy.map((entry) => (
              <li
                key={entry.key}
                className="flex min-h-12 items-center justify-between gap-3 px-1 text-base text-fg"
              >
                <span className="truncate font-medium">{entry.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {t(ROLE_KEY[entry.role])}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </BottomSheet>
  );
};
