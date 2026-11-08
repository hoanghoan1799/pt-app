"use client";

import clsx from "clsx";

import { BottomSheet } from "@/components/common/BottomSheet";
import { CHAT_REACTION_EMOJIS } from "@/features/chat/utils/chat-rules";

interface ReactionPickerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  mine: string | null;
  // null = remove my reaction.
  onPick: (emoji: string | null) => void;
}

// The six chat emoji in a sheet (same set and look as the chat message
// sheet); picking my current one removes it.
export const ReactionPicker = ({
  isOpen,
  onOpenChange,
  mine,
  onPick,
}: ReactionPickerProps) => (
  <BottomSheet
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    title="Cảm xúc"
    description="Chọn cảm xúc về bài viết này"
  >
    <div
      role="group"
      aria-label="Cảm xúc"
      className="mb-2 flex justify-between rounded-2xl border border-line bg-surface p-1.5"
    >
      {CHAT_REACTION_EMOJIS.map((emoji) => {
        const isMine = mine === emoji;

        return (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            aria-pressed={isMine}
            onClick={() => {
              onOpenChange(false);
              onPick(isMine ? null : emoji);
            }}
            className={clsx(
              "flex size-11 items-center justify-center rounded-full text-2xl transition active:scale-90",
              isMine && "bg-accent/20 ring-2 ring-accent",
            )}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  </BottomSheet>
);
