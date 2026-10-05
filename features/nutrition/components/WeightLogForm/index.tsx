"use client";

import { Scale } from "lucide-react";

import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT } from "@/constants/styles";
import { useWeightLogForm } from "@/features/nutrition/hooks/use-weight-log-form";
import { formatDecimal } from "@/features/nutrition/utils/energy";

interface WeightLogFormProps {
  todayWeight: number | null;
}

export const WeightLogForm = ({ todayWeight }: WeightLogFormProps) => {
  const { formAction, errorMessage } = useWeightLogForm();
  const defaultValue = todayWeight === null ? "" : formatDecimal(todayWeight);

  return (
    <form action={formAction}>
      <label
        htmlFor="weight-today"
        className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-fg"
      >
        <Scale className="size-4 text-muted" aria-hidden />
        {todayWeight === null
          ? "Cân hôm nay"
          : "Cân hôm nay (đã ghi, sửa nếu cần)"}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            key={defaultValue}
            id="weight-today"
            name="weightKg"
            defaultValue={defaultValue}
            inputMode="decimal"
            placeholder="VD: 72,5"
            required
            aria-invalid={Boolean(errorMessage)}
            className={`${INPUT} pr-10`}
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">
            kg
          </span>
        </div>
        <SubmitButton className={`${BUTTON_PRIMARY} shrink-0 px-5`}>
          Lưu
        </SubmitButton>
      </div>
      {errorMessage && <p className={FIELD_ERROR}>{errorMessage}</p>}
    </form>
  );
};
