"use client";

import { useState, useTransition } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { FIELD_ERROR } from "@/constants/styles";
import { ColorSwatches } from "@/features/chat/components/ColorSwatches";
import { adminSetChatColorAction } from "@/features/chat/services/chat-profile-actions";
import {
  type ChatColorKey,
  DEFAULT_CHAT_COLOR,
} from "@/features/chat/utils/chat-palette";

const FAILED_TEXT = "Không lưu được. Thử lại nhé.";

interface AccountColorSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // The saved account colour; null = never picked (shows the default).
  savedColor: ChatColorKey | null;
}

// Admin account colour (gear menu): used in every conversation that has no
// colour of its own. Saves on tap.
export const AccountColorSheet = ({
  isOpen,
  onOpenChange,
  savedColor,
}: AccountColorSheetProps) => {
  const [picked, setPicked] = useState<ChatColorKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selected = picked ?? savedColor ?? DEFAULT_CHAT_COLOR;

  const pick = (color: ChatColorKey) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await adminSetChatColorAction({ color });

        if (result.status === "success") {
          setPicked(color);
        } else {
          setError(result.message ?? FAILED_TEXT);
        }
      } catch {
        setError(FAILED_TEXT);
      }
    });
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Màu tài khoản"
      description="Dùng cho mọi cuộc trò chuyện chưa chọn màu riêng."
    >
      <div className="space-y-3">
        <ColorSwatches
          name="account"
          label="Màu tài khoản"
          selected={selected}
          disabled={isPending}
          onPick={pick}
        />
        {error && (
          <p role="alert" className={FIELD_ERROR}>
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  );
};
