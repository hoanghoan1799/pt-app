"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Spinner } from "@/components/common/Spinner";
import { setChatEnabledAction } from "@/features/chat/services/chat-admin-actions";

interface ChatLockSwitchProps {
  userId: number;
  enabled: boolean;
}

// "Cho phép nhắn tin" switch for one trainee (S1). Optimistic: flips at once,
// rolls back with an error text if the action fails.
export const ChatLockSwitch = ({ userId, enabled }: ChatLockSwitchProps) => {
  const t = useTranslations("chat.chatLockSwitch");
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [knownEnabled, setKnownEnabled] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The server value changed (refresh, another admin): follow it.
  if (enabled !== knownEnabled) {
    setKnownEnabled(enabled);
    setChecked(enabled);
  }

  const toggle = () => {
    const next = !checked;

    setChecked(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await setChatEnabledAction(userId, next);

        if (result.status === "error") {
          setChecked(!next);
          setError(result.message);
          return;
        }
        router.refresh();
      } catch {
        setChecked(!next);
        setError(t("failed"));
      }
    });
  };

  return (
    <div>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span id={`chat-switch-${userId}`} className="text-sm font-medium">
          {t("label")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={`chat-switch-${userId}`}
          disabled={isPending}
          aria-busy={isPending}
          onClick={toggle}
          className={clsx(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line transition-colors disabled:opacity-60",
            checked ? "bg-accent" : "bg-line",
          )}
        >
          <span
            aria-hidden
            className={clsx(
              "inline-flex size-5 items-center justify-center rounded-full bg-white text-muted shadow transition-transform",
              checked ? "translate-x-6" : "translate-x-1",
            )}
          >
            {isPending && <Spinner size="sm" />}
          </span>
        </button>
      </div>
      {error && (
        <p role="alert" className="pb-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
};
