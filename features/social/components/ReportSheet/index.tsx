"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  LABEL,
  TEXTAREA,
} from "@/constants/styles";
import { REPORT_REASON_MAX_LENGTH } from "@/features/social/constants/social";
import { useSocialAction } from "@/features/social/hooks/use-social-action";
import { reportAction } from "@/features/social/services/friend-actions";
import type { ReportTargetKind } from "@/features/social/utils/friend-rules";

interface ReportSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  mode: "user" | "admin";
  targetKind: ReportTargetKind;
  targetId: number;
}

// "Báo cáo": an optional reason, then it lands on the admin reports page.
export const ReportSheet = ({
  isOpen,
  onOpenChange,
  mode,
  targetKind,
  targetId,
}: ReportSheetProps) => {
  const t = useTranslations("social.reportSheet");
  const [reason, setReason] = useState("");
  const { isPending, run } = useSocialAction();

  const handleSend = () => {
    run(() => reportAction(mode, { targetKind, targetId, reason }), {
      successMessage: t("sent"),
      onSuccess: () => {
        setReason("");
        onOpenChange(false);
      },
    });
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t(`titles.${targetKind}`)}
      description={t("description")}
    >
      <div className="space-y-3 pb-2">
        <div>
          <label htmlFor={`report-${targetKind}-${targetId}`} className={LABEL}>
            {t("reasonLabel")}
          </label>
          <textarea
            id={`report-${targetKind}-${targetId}`}
            value={reason}
            maxLength={REPORT_REASON_MAX_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            className={TEXTAREA}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className={BUTTON_SECONDARY}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending}
            className={BUTTON_PRIMARY}
          >
            {t("send")}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
