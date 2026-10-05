"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { BUTTON_DANGER } from "@/constants/styles";
import { MEMBER_MESSAGES } from "@/features/members/constants/messages";
import { deleteMemberAction } from "@/features/members/services/member-actions";
import { describeErrorReference } from "@/utils/errors";

interface DeleteMemberButtonProps {
  userId: number;
}

export const DeleteMemberButton = ({ userId }: DeleteMemberButtonProps) => {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (!window.confirm(MEMBER_MESSAGES.DELETE_CONFIRM)) {
      return;
    }
    startTransition(async () => {
      // On success the action redirects to the dashboard.
      const result = await deleteMemberAction(userId);

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`${BUTTON_DANGER} w-full`}
    >
      {isPending ? (
        <Loader2 className="size-5 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="size-5" aria-hidden />
      )}
      Xóa user
    </button>
  );
};
