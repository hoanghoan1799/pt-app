"use client";

import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  LABEL,
  TEXTAREA,
} from "@/constants/styles";
import {
  FRIEND_MESSAGES,
  REPORT_REASON_MAX_LENGTH,
} from "@/features/social/constants/social";
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

const TITLES: Record<ReportTargetKind, string> = {
  post: "Báo cáo bài viết",
  comment: "Báo cáo bình luận",
  user: "Báo cáo người dùng",
};

// "Báo cáo": an optional reason, then it lands on the admin reports page.
export const ReportSheet = ({
  isOpen,
  onOpenChange,
  mode,
  targetKind,
  targetId,
}: ReportSheetProps) => {
  const [reason, setReason] = useState("");
  const { isPending, run } = useSocialAction();

  const handleSend = () => {
    run(() => reportAction(mode, { targetKind, targetId, reason }), {
      successMessage: FRIEND_MESSAGES.REPORT_SENT,
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
      title={TITLES[targetKind]}
      description="Quản trị viên sẽ xem xét báo cáo của bạn."
    >
      <div className="space-y-3 pb-2">
        <div>
          <label htmlFor={`report-${targetKind}-${targetId}`} className={LABEL}>
            Lý do (không bắt buộc)
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
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending}
            className={BUTTON_PRIMARY}
          >
            Gửi báo cáo
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
