"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { Spinner } from "@/components/common/Spinner";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  LABEL,
  TEXTAREA,
} from "@/constants/styles";
import {
  REPORT_REASON_CODES,
  REPORT_REASON_MAX_LENGTH,
} from "@/features/social/constants/social";
import { useSocialAction } from "@/features/social/hooks/use-social-action";
import { reportAction } from "@/features/social/services/friend-actions";
import type {
  ReportReasonCode,
  ReportTargetKind,
} from "@/features/social/utils/friend-rules";

interface ReportSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  mode: "user" | "admin";
  targetKind: ReportTargetKind;
  targetId: number;
}

const OPTION =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium text-fg transition";

// "Báo cáo": a reason from the fixed list plus an optional note, then it lands
// on the admin reports page. Used for posts, comments, users and chat messages.
export const ReportSheet = ({
  isOpen,
  onOpenChange,
  mode,
  targetKind,
  targetId,
}: ReportSheetProps) => {
  const t = useTranslations("social.reportSheet");
  const [reasonCode, setReasonCode] = useState<ReportReasonCode | null>(null);
  const [reason, setReason] = useState("");
  const { isPending, run } = useSocialAction();

  const handleSend = () => {
    if (!reasonCode) {
      return;
    }
    run(
      () => reportAction(mode, { targetKind, targetId, reasonCode, reason }),
      {
        successMessage: t("sent"),
        onSuccess: () => {
          setReasonCode(null);
          setReason("");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t(`titles.${targetKind}`)}
      description={t("description")}
    >
      <div className="space-y-3 pb-2">
        <fieldset>
          <legend className={LABEL}>{t("reasonPrompt")}</legend>
          <div className="space-y-1.5">
            {REPORT_REASON_CODES.map((code) => (
              <label
                key={code}
                className={clsx(
                  OPTION,
                  reasonCode === code
                    ? "border-accent bg-accent/10"
                    : "border-line bg-surface",
                )}
              >
                <input
                  type="radio"
                  name={`report-reason-${targetKind}-${targetId}`}
                  value={code}
                  checked={reasonCode === code}
                  onChange={() => setReasonCode(code)}
                  className="size-4 accent-[var(--accent)]"
                />
                {t(`reasons.${code}`)}
              </label>
            ))}
          </div>
        </fieldset>
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
            disabled={isPending || !reasonCode}
            aria-busy={isPending}
            className={BUTTON_PRIMARY}
          >
            {isPending && <Spinner size="sm" />}
            {t("send")}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
