"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { ROUTES } from "@/constants/routes";
import { BUTTON_SECONDARY } from "@/constants/styles";
import { HIDDEN_CHAT_MESSAGES } from "@/features/chat/constants/messages";
import {
  hideUsersAction,
  unhideUserAction,
} from "@/features/chat/services/chat-hidden-actions";

interface HideUserButtonProps {
  userId: number;
  isHidden: boolean;
  hasPasscode: boolean;
}

const FAILED_TEXT = "Không thực hiện được. Thử lại nhé.";

// Hide this trainee from the admin everywhere (R4), or bring them back. Hiding
// needs a passcode and returns to the dashboard, where they are gone.
export const HideUserButton = ({
  userId,
  isHidden,
  hasPasscode,
}: HideUserButtonProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (!isHidden && !hasPasscode) {
      toast.info(HIDDEN_CHAT_MESSAGES.PASSCODE_REQUIRED);
      return;
    }
    startTransition(async () => {
      try {
        const result = isHidden
          ? await unhideUserAction(userId)
          : await hideUsersAction([userId]);

        if (result.status !== "success") {
          toast.error(result.message ?? FAILED_TEXT);
          return;
        }
        if (isHidden) {
          toast.success("Đã bỏ ẩn học viên");
          router.refresh();
          return;
        }
        toast.success("Đã ẩn 1 học viên");
        router.push(ROUTES.ADMIN);
      } catch {
        toast.error(FAILED_TEXT);
      }
    });
  };

  const Icon = isHidden ? Eye : EyeOff;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`${BUTTON_SECONDARY} w-full`}
    >
      {isPending ? (
        <Loader2 className="size-5 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-5" aria-hidden />
      )}
      {isHidden ? "Bỏ ẩn học viên" : "Ẩn học viên"}
    </button>
  );
};
