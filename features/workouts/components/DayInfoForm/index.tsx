"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/common/Input";
import { SubmitButton } from "@/components/common/SubmitButton";
import {
  BUTTON_PRIMARY,
  FIELD_ERROR,
  LABEL,
  TEXTAREA,
} from "@/constants/styles";
import { EXERCISE_LIMITS } from "@/features/workouts/constants/messages";
import { useDayInfoForm } from "@/features/workouts/hooks/use-day-info-form";
import type { ScheduleDay } from "@/features/workouts/types/workout";

interface DayInfoFormProps {
  day: ScheduleDay;
  userId: number;
  onSaved: () => void;
}

export const DayInfoForm = ({ day, userId, onSaved }: DayInfoFormProps) => {
  const t = useTranslations("workouts.dayInfoForm");
  const { formAction, fieldErrors } = useDayInfoForm(onSaved);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="date" value={day.date} />
      <div>
        <label htmlFor="day-title" className={LABEL}>
          {t("titleLabel")}
        </label>
        <Input
          clearable
          id="day-title"
          name="title"
          defaultValue={day.title}
          placeholder={t("titlePlaceholder")}
          maxLength={EXERCISE_LIMITS.DAY_TITLE}
          autoCapitalize="sentences"
        />
        {fieldErrors.title && (
          <p className={FIELD_ERROR}>{fieldErrors.title}</p>
        )}
      </div>
      <div>
        <label htmlFor="day-note" className={LABEL}>
          {t("noteLabel")}
        </label>
        <textarea
          id="day-note"
          name="note"
          defaultValue={day.note}
          rows={4}
          maxLength={EXERCISE_LIMITS.DAY_NOTE}
          placeholder={t("notePlaceholder")}
          className={TEXTAREA}
        />
        {fieldErrors.note && <p className={FIELD_ERROR}>{fieldErrors.note}</p>}
      </div>
      <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
        {t("save")}
      </SubmitButton>
    </form>
  );
};
