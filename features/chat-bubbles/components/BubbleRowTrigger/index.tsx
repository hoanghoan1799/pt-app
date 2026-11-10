"use client";

import { CircleDot, CircleOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/common/BottomSheet";
import {
  dispatchBubble,
  useBubbleStore,
} from "@/features/chat-bubbles/hooks/use-bubble-store";
import { useLongPress } from "@/features/chat-bubbles/hooks/use-long-press";
import type { BubbleRole } from "@/features/chat-bubbles/types";

interface BubbleRowTriggerProps {
  role: BubbleRole;
  bubbleKey: string;
  name: string;
  // Selection mode and the like: long-press does nothing.
  disabled?: boolean;
  children: ReactNode;
}

const SHEET_ITEM =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium text-fg transition active:bg-line";

// Wraps an inbox row (a link): a long-press (about 500 ms) opens a sheet to
// show the chat as a bubble or to stop its bubbles for this person. The tap and
// the link keep working as before.
export const BubbleRowTrigger = ({
  role,
  bubbleKey,
  name,
  disabled = false,
  children,
}: BubbleRowTriggerProps) => {
  const t = useTranslations("chat.bubbles");
  const [isOpen, setIsOpen] = useState(false);
  const [state] = useBubbleStore(role);
  const isMuted = state.muted.includes(bubbleKey);
  const press = useLongPress(() => setIsOpen(true), disabled);

  const openBubble = () => {
    dispatchBubble(role, { type: "open", key: bubbleKey });
    toast(t("opened"));
    setIsOpen(false);
  };

  const toggleMute = () => {
    if (isMuted) {
      dispatchBubble(role, { type: "unmute", key: bubbleKey });
      toast(t("unmuted", { name }));
    } else {
      dispatchBubble(role, { type: "mute", key: bubbleKey });
      toast(t("muted", { name }));
    }
    setIsOpen(false);
  };

  return (
    <>
      <div
        {...press}
        // A row of links: no callout / text selection while pressing.
        className="contents [-webkit-touch-callout:none] select-none"
      >
        {children}
      </div>
      <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} title={name}>
        <button type="button" className={SHEET_ITEM} onClick={openBubble}>
          <CircleDot className="size-5" aria-hidden />
          {t("openBubble")}
        </button>
        <button type="button" className={SHEET_ITEM} onClick={toggleMute}>
          <CircleOff className="size-5" aria-hidden />
          {isMuted ? t("unmuteThis") : t("muteThis")}
        </button>
      </BottomSheet>
    </>
  );
};
