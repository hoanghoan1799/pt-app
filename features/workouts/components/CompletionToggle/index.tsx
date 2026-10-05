import clsx from "clsx";
import { CalendarClock, CheckCircle2, Circle } from "lucide-react";

import { TIME_ZONE } from "@/constants/time";
import { formatClockTime } from "@/utils/time";

interface CompletionToggleProps {
  completedAt: number | null;
  canComplete: boolean;
  isPending: boolean;
  onToggle: () => void;
}

const TOGGLE_BASE =
  "flex min-h-14 w-full items-center justify-center gap-2 border-t text-base font-semibold transition active:opacity-70";

export const CompletionToggle = ({
  completedAt,
  canComplete,
  isPending,
  onToggle,
}: CompletionToggleProps) => {
  if (completedAt !== null) {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={isPending}
        aria-pressed
        className={clsx(
          TOGGLE_BASE,
          "border-success/30 bg-success/12 text-success",
        )}
      >
        <CheckCircle2 className="size-5" aria-hidden />
        Đã tập xong · {formatClockTime(completedAt, TIME_ZONE)}
        <span className="text-sm font-normal opacity-70">(bấm để bỏ)</span>
      </button>
    );
  }

  if (!canComplete) {
    return (
      <p
        className={clsx(
          TOGGLE_BASE,
          "border-line text-sm font-medium text-muted",
        )}
      >
        <CalendarClock className="size-5" aria-hidden />
        Chưa tới ngày tập
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isPending}
      aria-pressed={false}
      className={clsx(TOGGLE_BASE, "border-line text-accent")}
    >
      <Circle className="size-5" aria-hidden />
      Đánh dấu đã tập
    </button>
  );
};
