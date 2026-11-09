"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { Spinner } from "@/components/common/Spinner";
import { BUTTON_DANGER } from "@/constants/styles";
import { deleteMemberAction } from "@/features/members/services/member-actions";
import { describeErrorReference } from "@/utils/errors";

interface DeleteMemberButtonProps {
  userId: number;
}

export const DeleteMemberButton = ({ userId }: DeleteMemberButtonProps) => {
  const t = useTranslations("members.deleteMember");
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const handleClick = async () => {
    const isConfirmed = await confirm({
      title: t("confirmTitle"),
      confirmLabel: t("confirmLabel"),
      isDanger: true,
    });

    if (!isConfirmed) {
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
      aria-busy={isPending}
      className={`${BUTTON_DANGER} w-full`}
    >
      {isPending ? (
        <Spinner size="md" />
      ) : (
        <Trash2 className="size-5" aria-hidden />
      )}
      {t("trigger")}
    </button>
  );
};
