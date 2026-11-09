"use client";

import { useTranslations } from "next-intl";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { BUTTON_DANGER, BUTTON_SECONDARY } from "@/constants/styles";
import { useSocialAction } from "@/features/social/hooks/use-social-action";
import { resolveReportAction } from "@/features/social/services/friend-actions";

interface ReportActionsProps {
  reportId: number;
  // A user report has nothing to delete: one button closes it.
  canDelete: boolean;
}

const SMALL = "min-h-11 flex-1 px-4 text-sm";

// "Giữ" closes the report and leaves the content; "Xoá nội dung" deletes it.
export const ReportActions = ({ reportId, canDelete }: ReportActionsProps) => {
  const t = useTranslations("social.reportActions");
  const confirm = useConfirm();
  const { isPending, run } = useSocialAction();

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      title: t("deleteTitle"),
      description: t("deleteDescription"),
      confirmLabel: t("deleteConfirm"),
      isDanger: true,
    });

    if (isConfirmed) {
      run(() => resolveReportAction({ reportId, resolution: "deleted" }));
    }
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          run(() => resolveReportAction({ reportId, resolution: "kept" }))
        }
        className={`${BUTTON_SECONDARY} ${SMALL}`}
      >
        {canDelete ? t("keep") : t("handled")}
      </button>
      {canDelete && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleDelete}
          className={`${BUTTON_DANGER} ${SMALL}`}
        >
          {t("deleteContent")}
        </button>
      )}
    </div>
  );
};
