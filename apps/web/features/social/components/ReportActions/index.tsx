"use client";

import { useTranslations } from "next-intl";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { Spinner } from "@/components/common/Spinner";
import { BUTTON_DANGER, BUTTON_SECONDARY } from "@/constants/styles";
import { useReportBlock } from "@/features/social/components/ReportBlockHost";
import { useSocialAction } from "@/features/social/hooks/use-social-action";
import { resolveReportAction } from "@/features/social/services/friend-actions";

interface ReportActionsProps {
  reportId: number;
  // A user report has nothing to delete: one button closes it.
  canDelete: boolean;
  // A chat message report: Keep / Hide instead of Keep / Delete, and Hide +
  // block when the sender is a trainee (their id).
  message?: { blockUserId: number | null };
}

const SMALL = "min-h-11 flex-1 px-4 text-sm";

// "Giữ" closes the report and leaves the content; "Xoá nội dung" deletes it.
// A message report has "Ẩn" instead (the message disappears for everybody)
// and, for a trainee's message, "Ẩn + chặn" (hide, then the block sheet).
export const ReportActions = ({
  reportId,
  canDelete,
  message,
}: ReportActionsProps) => {
  const t = useTranslations("social.reportActions");
  const confirm = useConfirm();
  const openBlock = useReportBlock();
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

  const handleHide = async (blockUserId: number | null) => {
    const isConfirmed = await confirm({
      title: t("hideTitle"),
      description: t("hideDescription"),
      confirmLabel: t("hideConfirm"),
      isDanger: true,
    });

    if (isConfirmed) {
      run(() => resolveReportAction({ reportId, resolution: "hidden" }), {
        // Hidden and resolved first, then the block sheet for the sender.
        onSuccess: () => {
          if (blockUserId !== null) {
            openBlock(blockUserId);
          }
        },
      });
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
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
        {canDelete || message ? t("keep") : t("handled")}
      </button>
      {message && (
        <>
          <button
            type="button"
            disabled={isPending}
            aria-busy={isPending}
            onClick={() => void handleHide(null)}
            className={`${BUTTON_DANGER} ${SMALL}`}
          >
            {isPending && <Spinner size="sm" />}
            {t("hide")}
          </button>
          {message.blockUserId !== null && (
            <button
              type="button"
              disabled={isPending}
              aria-busy={isPending}
              onClick={() => void handleHide(message.blockUserId)}
              className={`${BUTTON_DANGER} ${SMALL}`}
            >
              {isPending && <Spinner size="sm" />}
              {t("hideBlock")}
            </button>
          )}
        </>
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
