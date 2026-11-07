"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { ROUTES } from "@/constants/routes";
import { BUTTON_SECONDARY } from "@/constants/styles";
import {
  hideConversationsAction,
  isConversationHiddenAction,
  unhideConversationAction,
} from "@/features/chat/services/chat-hidden-actions";

const FAILED_TEXT = "Không lưu được. Thử lại nhé.";

// Admin only: hide this chat from the inbox or bring it back (KAN-164). It
// was in the conversation settings sheet and is now an action of the chat
// info page (KAN-160).
export const HideConversationButton = ({
  conversationId,
}: {
  conversationId: number | null;
}) => {
  const router = useRouter();
  const [isHidden, setIsHidden] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (conversationId === null) {
      return;
    }
    let cancelled = false;

    isConversationHiddenAction(conversationId)
      .then((result) => {
        if (!cancelled && result.status === "success" && "hidden" in result) {
          setIsHidden(result.hidden);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (conversationId === null || isHidden === null) {
    return null;
  }

  const toggle = () => {
    startTransition(async () => {
      try {
        const result = isHidden
          ? await unhideConversationAction(conversationId)
          : await hideConversationsAction([conversationId]);

        if (result.status !== "success") {
          toast.error(result.message ?? FAILED_TEXT);
          return;
        }
        if (isHidden) {
          setIsHidden(false);
          toast.success("Đã bỏ ẩn học viên");
          router.refresh();
          return;
        }
        toast.success("Đã ẩn 1 học viên");
        router.push(ROUTES.ADMIN_MESSAGES);
      } catch {
        toast.error(FAILED_TEXT);
      }
    });
  };

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={toggle}
      className={clsx(BUTTON_SECONDARY, "w-full")}
    >
      {isHidden ? "Bỏ ẩn học viên" : "Ẩn học viên"}
    </button>
  );
};
