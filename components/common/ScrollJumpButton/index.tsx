"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import { cn } from "@/utils/cn";
import { formatJumpCount } from "@/utils/scroll-rules";

interface ScrollJumpButtonProps {
  direction: "up" | "down";
  visible: boolean;
  // Accessible name and tooltip.
  label: string;
  count?: number;
  onClick: () => void;
  // Positioning (absolute/fixed offsets) from the caller.
  className?: string;
}

// Round floating button that jumps back to the top or latest content. Always
// mounted so showing it never shifts the layout.
export const ScrollJumpButton = ({
  direction,
  visible,
  label,
  count = 0,
  onClick,
  className,
}: ScrollJumpButtonProps) => {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  const badge = formatJumpCount(count);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        "relative z-20 inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-lg shadow-black/25 transition duration-200 active:scale-95 motion-reduce:transition-none",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
        className,
      )}
    >
      <Icon className="size-5" aria-hidden />
      {badge && (
        <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs leading-5 font-semibold text-accent-fg">
          {badge}
        </span>
      )}
    </button>
  );
};
