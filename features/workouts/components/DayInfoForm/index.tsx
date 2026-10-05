"use client";

import { SubmitButton } from "@/components/common/SubmitButton";
import {
  BUTTON_PRIMARY,
  FIELD_ERROR,
  INPUT,
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
  const { formAction, fieldErrors } = useDayInfoForm(onSaved);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="date" value={day.date} />
      <div>
        <label htmlFor="day-title" className={LABEL}>
          Tiêu đề ngày
        </label>
        <input
          id="day-title"
          name="title"
          defaultValue={day.title}
          placeholder="VD: Push – Ngực, vai, tay sau"
          maxLength={EXERCISE_LIMITS.DAY_TITLE}
          autoCapitalize="sentences"
          className={INPUT}
        />
        {fieldErrors.title && (
          <p className={FIELD_ERROR}>{fieldErrors.title}</p>
        )}
      </div>
      <div>
        <label htmlFor="day-note" className={LABEL}>
          Ghi chú cho cả buổi
        </label>
        <textarea
          id="day-note"
          name="note"
          defaultValue={day.note}
          rows={4}
          maxLength={EXERCISE_LIMITS.DAY_NOTE}
          placeholder="VD: Khởi động 10 phút, nghỉ 60–90 giây giữa hiệp"
          className={TEXTAREA}
        />
        {fieldErrors.note && <p className={FIELD_ERROR}>{fieldErrors.note}</p>}
      </div>
      <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>Lưu</SubmitButton>
    </form>
  );
};
