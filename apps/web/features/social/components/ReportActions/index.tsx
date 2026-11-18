"use client";

import { useTranslations } from "next-intl";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { Spinner } from "@/components/common/Spinner";
import { BUTTON_DANGER, BUTTON_SECONDARY } from "@/constants/styles";
import { useSocialAction } from "@/features/social/hooks/use-social-action";
import { resolveReportAction } from "@/features/social/services/friend-actions";

interface ReportActionsProps {
  reportId: number;
  // A user report has nothing to delete: one button closes it.
  canDelete: boolean;
  // A chat message report: Keep / Hide instead of Keep / Delete.
  isMessage?: boolean;
}

const SMALL = "min-h-11 flex-1 px-4 text-sm";

// "Giữ" closes the report and leaves the content; "Xoá nội dung" deletes it.
// A message report has "Ẩn" instead: the message disappears for everybody.
export const ReportActions = ({
  reportId,
  canDelete,
  isMessage = false,
}: ReportActionsProps) => {
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

  const handleHide = async () => {
    const isConfirmed = await confirm({
      title: t("hideTitle"),
      description: t("hideDescription"),
      confirmLabel: t("hideConfirm"),
      isDanger: true,
    });

    if (isConfirmed) {
      run(() => resolveReportAction({ reportId, resolution: "hidden" }));
    }
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={isPending}
        aria-busy={isPending}
        onClick={() =>
          run(() => resolveReportAction({ reportId, resolution: "kept" }))
        }
        className={`${BUTTON_SECONDARY} ${SMALL}`}
      >
        {isPending && <Spinner size="sm" />}
        {canDelete || isMessage ? t("keep") : t("handled")}
      </button>
      {isMessage && (
        <button
          type="button"
          disabled={isPending}
          aria-busy={isPending}
          onClick={handleHide}
          className={`${BUTTON_DANGER} ${SMALL}`}
        >
          {isPending && <Spinner size="sm" />}
          {t("hide")}
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          disabled={isPending}
          aria-busy={isPending}
          onClick={handleDelete}
          className={`${BUTTON_DANGER} ${SMALL}`}
        >
          {isPending && <Spinner size="sm" />}
          {t("deleteContent")}
        </button>
      )}
    </div>
  );
};
