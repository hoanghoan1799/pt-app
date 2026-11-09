"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";

import { SubmitButton } from "@/components/common/SubmitButton";
import {
  BUTTON_PRIMARY,
  FIELD_ERROR,
  INPUT,
  LABEL,
  TEXTAREA,
} from "@/constants/styles";
import {
  MACRO_COLORS,
  MACRO_LABELS,
  MACROS,
  NUTRITION_LIMITS,
} from "@/features/nutrition/constants/nutrition";
import { useTargetForm } from "@/features/nutrition/hooks/use-target-form";
import type { NutritionTarget } from "@/features/nutrition/types/nutrition";

interface TargetFormProps {
  userId: number;
  target: NutritionTarget | null;
  onSaved: () => void;
}

export const TargetForm = ({ userId, target, onSaved }: TargetFormProps) => {
  const t = useTranslations("nutrition.targetForm");
  const tLabels = useTranslations("nutrition.labels");
  const { formAction, fieldErrors } = useTargetForm(onSaved);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      {MACROS.map((macro) => (
        <div key={macro}>
          <label htmlFor={`target-${macro}`} className={LABEL}>
            <span className={clsx("font-semibold", MACRO_COLORS[macro].text)}>
              {tLabels(MACRO_LABELS[macro].nameKey)}
            </span>{" "}
            <span className="font-normal text-muted">
              ({tLabels(MACRO_LABELS[macro].foodsKey)})
            </span>
          </label>
          <div className="relative">
            <input
              id={`target-${macro}`}
              name={macro}
              defaultValue={target?.[macro] ?? ""}
              inputMode="numeric"
              pattern="[0-9]*"
              required
              placeholder="0"
              aria-invalid={Boolean(fieldErrors[macro])}
              className={`${INPUT} pr-24`}
            />
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">
              {t("gramsPerDay")}
            </span>
          </div>
          {fieldErrors[macro] && (
            <p className={FIELD_ERROR}>{fieldErrors[macro]}</p>
          )}
        </div>
      ))}
      <div>
        <label htmlFor="target-note" className={LABEL}>
          {t("ptNote")}
        </label>
        <textarea
          id="target-note"
          name="note"
          defaultValue={target?.note}
          rows={3}
          maxLength={NUTRITION_LIMITS.NOTE}
          placeholder={t("notePlaceholder")}
          className={TEXTAREA}
        />
      </div>
      <p className="text-xs text-muted">{t("hint")}</p>
      <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
        {t("save")}
      </SubmitButton>
    </form>
  );
};
