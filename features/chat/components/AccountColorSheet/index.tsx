"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { FIELD_ERROR } from "@/constants/styles";
import { ColorSwatches } from "@/features/chat/components/ColorSwatches";
import { adminSetChatColorAction } from "@/features/chat/services/chat-profile-actions";
import {
  type ChatColorKey,
  DEFAULT_CHAT_COLOR,
} from "@/features/chat/utils/chat-palette";

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
  const t = useTranslations("chat.accountColor");
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
          setError(result.message ?? t("failed"));
        }
      } catch {
        setError(t("failed"));
      }
    });
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
    >
      <div className="space-y-3">
        <ColorSwatches
          name="account"
          label={t("title")}
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
