"use client";

import { Scale } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/common/Input";
import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR } from "@/constants/styles";
import { useWeightLogForm } from "@/features/nutrition/hooks/use-weight-log-form";
import { formatDecimal } from "@/features/nutrition/utils/energy";

interface WeightLogFormProps {
  todayWeight: number | null;
}

export const WeightLogForm = ({ todayWeight }: WeightLogFormProps) => {
  const t = useTranslations("nutrition.weightLogForm");
  const { formAction, errorMessage } = useWeightLogForm();
  const defaultValue = todayWeight === null ? "" : formatDecimal(todayWeight);

  return (
    <form action={formAction}>
      <label
        htmlFor="weight-today"
        className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-fg"
      >
        <Scale className="size-4 text-muted" aria-hidden />
        {todayWeight === null ? t("todayWeight") : t("todayWeightLogged")}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            key={defaultValue}
            id="weight-today"
            name="weightKg"
            defaultValue={defaultValue}
            inputMode="decimal"
            placeholder={t("placeholder")}
            required
            aria-invalid={Boolean(errorMessage)}
            className="pr-10"
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">
            kg
          </span>
        </div>
        <SubmitButton className={`${BUTTON_PRIMARY} shrink-0 px-5`}>
          {t("save")}
        </SubmitButton>
      </div>
      {errorMessage && <p className={FIELD_ERROR}>{errorMessage}</p>}
    </form>
  );
};
