"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Spinner } from "@/components/common/Spinner";
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

// Hide this trainee from the admin everywhere (R4), or bring them back. Hiding
// needs a passcode and returns to the dashboard, where they are gone.
export const HideUserButton = ({
  userId,
  isHidden,
  hasPasscode,
}: HideUserButtonProps) => {
  const t = useTranslations("members.hideUser");
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
          toast.error(result.message ?? t("failed"));
          return;
        }
        if (isHidden) {
          toast.success(t("unhidden"));
          router.refresh();
          return;
        }
        toast.success(t("hidden"));
        router.push(ROUTES.ADMIN);
      } catch {
        toast.error(t("failed"));
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
        <Spinner size="md" />
      ) : (
        <Icon className="size-5" aria-hidden />
      )}
      {isHidden ? t("unhide") : t("hide")}
    </button>
  );
};
