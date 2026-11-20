"use client";

import {
  RESTRICTION_DURATIONS,
  RESTRICTION_LEVELS,
  RESTRICTION_REASON_MAX,
} from "@pt/contracts";
import clsx from "clsx";
import { useTranslations } from "next-intl";

import { BottomSheet } from "@/components/common/BottomSheet";
import { SubmitButton } from "@/components/common/SubmitButton";
import {
  BUTTON_PRIMARY,
  FIELD_ERROR,
  LABEL,
  TEXTAREA,
} from "@/constants/styles";
import { useBlockUser } from "@/features/restrictions/hooks/use-block-user";

interface BlockUserSheetProps {
  userId: number;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // After a successful block, e.g. to refresh the page behind the sheet.
  onBlocked?: () => void;
}

const OPTION =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition";

// Reusable: the trainee page opens it with the trainee's id, and the chat
// report screen can open the same sheet for a reported trainee.
export const BlockUserSheet = ({
  userId,
  isOpen,
  onOpenChange,
  onBlocked,
}: BlockUserSheetProps) => {
  const t = useTranslations("restrictions");
  const form = useBlockUser({
    userId,
    onBlocked: () => {
      onOpenChange(false);
      onBlocked?.();
    },
  });

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("sheet.title")}
      description={t("sheet.description")}
    >
      <form onSubmit={form.submit} className="space-y-4">
        <fieldset>
          <legend className={LABEL}>{t("sheet.levelLabel")}</legend>
          <div className="space-y-1.5">
            {RESTRICTION_LEVELS.map((level) => (
              <label
                key={level}
                className={clsx(
                  OPTION,
                  form.level === level
                    ? "border-accent bg-accent/10"
                    : "border-line bg-surface",
                )}
              >
                <input
                  type="radio"
                  name="level"
                  value={level}
                  checked={form.level === level}
                  onChange={() => form.setLevel(level)}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-fg">
                    {t(`levels.${level}`)}
                  </span>
                  <span className="block text-xs text-muted">
                    {t(`levelHints.${level}`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className={LABEL}>{t("sheet.durationLabel")}</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {RESTRICTION_DURATIONS.map((duration) => (
              <label
                key={duration}
                className={clsx(
                  OPTION,
                  form.duration === duration
                    ? "border-accent bg-accent/10"
                    : "border-line bg-surface",
                )}
              >
                <input
                  type="radio"
                  name="duration"
                  value={duration}
                  checked={form.duration === duration}
                  onChange={() => form.setDuration(duration)}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="text-sm font-semibold text-fg">
                  {t(`durations.${duration}`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="block-reason" className={LABEL}>
            {t("sheet.reasonLabel")}
          </label>
          <textarea
            id="block-reason"
            name="reason"
            value={form.reason}
            onChange={(event) => form.setReason(event.target.value)}
            maxLength={RESTRICTION_REASON_MAX}
            placeholder={t("sheet.reasonPlaceholder")}
            required
            className={TEXTAREA}
          />
          <p className="mt-1 text-right text-xs text-muted tabular-nums">
            {t("sheet.reasonCount", {
              count: form.reason.length,
              max: RESTRICTION_REASON_MAX,
            })}
          </p>
          {form.error && (
            <p role="alert" className={FIELD_ERROR}>
              {form.error}
            </p>
          )}
        </div>
        <SubmitButton
          isPending={form.isPending}
          className={`${BUTTON_PRIMARY} w-full`}
        >
          {form.isPending ? t("sheet.saving") : t("sheet.submit")}
        </SubmitButton>
      </form>
    </BottomSheet>
  );
};
