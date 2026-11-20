"use client";

import clsx from "clsx";
import { useId } from "react";

import { Spinner } from "@/components/common/Spinner";

interface GroupSwitchRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  isPending: boolean;
  onChange: (next: boolean) => void;
}

// A labelled on/off switch row (same look as the chat lock switch).
export const GroupSwitchRow = ({
  label,
  hint,
  checked,
  isPending,
  onChange,
}: GroupSwitchRowProps) => {
  const id = useId();

  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <span id={id} className="text-sm font-medium text-fg">
          {label}
        </span>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={isPending}
        aria-busy={isPending}
        onClick={() => onChange(!checked)}
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
  );
};
