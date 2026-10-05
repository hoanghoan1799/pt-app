"use client";

import clsx from "clsx";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { Toaster } from "sonner";

const TOAST_DURATION_MS = 4000;

interface ToastIconProps {
  icon: LucideIcon;
  className: string;
  isSpinning?: boolean;
}

const ToastIcon = ({ icon: Icon, className, isSpinning }: ToastIconProps) => (
  <span
    className={clsx(
      "flex size-9 items-center justify-center rounded-full",
      className,
    )}
  >
    <Icon
      className={clsx("size-5", isSpinning && "animate-spin")}
      strokeWidth={2.25}
    />
  </span>
);

const TOAST_ICONS = {
  success: (
    <ToastIcon icon={CircleCheck} className="bg-success/15 text-success" />
  ),
  error: <ToastIcon icon={CircleX} className="bg-danger/12 text-danger" />,
  warning: (
    <ToastIcon icon={CircleAlert} className="bg-accent/15 text-accent" />
  ),
  info: <ToastIcon icon={Info} className="bg-line text-fg" />,
  loading: (
    <ToastIcon icon={Loader2} className="bg-line text-muted" isSpinning />
  ),
};

// Sonner handles stacking, swipe-to-dismiss and timing; the look is ours
// (unstyled + Tailwind) so toasts match the cards and follow light/dark mode.
export const AppToaster = () => (
  <Toaster
    position="top-center"
    duration={TOAST_DURATION_MS}
    gap={10}
    visibleToasts={3}
    icons={TOAST_ICONS}
    offset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
    mobileOffset={{
      top: "calc(env(safe-area-inset-top) + 8px)",
      left: "12px",
      right: "12px",
    }}
    toastOptions={{
      unstyled: true,
      classNames: {
        toast:
          "flex w-full items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 pr-4 text-fg shadow-[0_16px_40px_-12px_rgb(0_0_0/0.35)] backdrop-blur-xl",
        success: "border-success/30",
        error: "border-danger/35",
        icon: "shrink-0",
        content: "flex min-w-0 flex-1 flex-col justify-center",
        title: "text-[15px] leading-snug font-semibold text-balance",
        description: "mt-0.5 text-[13px] leading-snug text-muted",
      },
    }}
  />
);
