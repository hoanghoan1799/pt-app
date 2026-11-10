"use client";

import clsx from "clsx";
import { PictureInPicture2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ICON_BUTTON } from "@/constants/styles";
import { dispatchBubble } from "@/features/chat-bubbles/hooks/use-bubble-store";
import type { BubbleRole } from "@/features/chat-bubbles/types";

interface MinimizeButtonProps {
  role: BubbleRole;
  bubbleKey: string;
  // Leaves the chat screen once the bubble exists (back / the inbox).
  onMinimized: () => void;
  className?: string;
}

// Header button: turns this chat into a floating bubble and leaves the screen.
export const MinimizeButton = ({
  role,
  bubbleKey,
  onMinimized,
  className,
}: MinimizeButtonProps) => {
  const t = useTranslations("chat.bubbles");

  return (
    <button
      type="button"
      onClick={() => {
        dispatchBubble(role, { type: "open", key: bubbleKey });
        toast(t("minimized"));
        onMinimized();
      }}
      aria-label={t("minimize")}
      title={t("minimize")}
      className={clsx(ICON_BUTTON, className)}
    >
      <PictureInPicture2 className="size-5" aria-hidden />
    </button>
  );
};
