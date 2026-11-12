import { NUTRITION_LIMITS } from "@pt/contracts";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import type { FormEvent } from "react";

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
  MEAL_SHORT_LABEL_KEYS,
  MEALS,
} from "@/features/nutrition/constants/nutrition";
import type { FoodEntry, Meal } from "@/features/nutrition/types/nutrition";

interface FoodEntryFormViewProps {
  entry: FoodEntry | null;
  date: string;
  meal: Meal;
  isPending: boolean;
  fieldErrors: Partial<Record<string, string>>;
  formError?: string;
  onMealChange: (meal: Meal) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export const FoodEntryFormView = ({
  entry,
  date,
  meal,
  isPending,
  fieldErrors,
  formError,
  onMealChange,
  onSubmit,
}: FoodEntryFormViewProps) => {
  const t = useTranslations("nutrition.foodEntryFormView");
  const tLabels = useTranslations("nutrition.labels");

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="entryId" value={entry?.id ?? ""} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={meal} />

      <fieldset>
        <legend className={LABEL}>{t("mealLegend")}</legend>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-line/60 p-1">
          {MEALS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onMealChange(item)}
              aria-pressed={meal === item}
              className={clsx(
                "min-h-10 rounded-lg text-sm font-semibold transition",
                meal === item ? "bg-surface text-fg shadow-sm" : "text-muted",
              )}
            >
              {tLabels(MEAL_SHORT_LABEL_KEYS[item])}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="description" className={LABEL}>
          {t("foodLabel")}
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={entry?.description}
          rows={2}
          maxLength={NUTRITION_LIMITS.DESCRIPTION}
          placeholder={t("placeholder")}
          className={TEXTAREA}
        />
      </div>

      <div>
        <p className={LABEL}>{t("estimateLabel")}</p>
        <div className="grid grid-cols-3 gap-2">
          {MACROS.map((macro) => (
            <div key={macro}>
              <label
                htmlFor={macro}
                className={clsx(
                  "mb-1 block text-xs font-semibold",
                  MACRO_COLORS[macro].text,
                )}
              >
                {tLabels(MACRO_LABELS[macro].nameKey)}
              </label>
              <div className="relative">
                <input
                  id={macro}
                  name={macro}
                  defaultValue={entry?.[macro] ?? ""}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="0"
                  aria-invalid={Boolean(fieldErrors[macro])}
                  className={`${INPUT} pr-8`}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">
                  g
                </span>
              </div>
            </div>
          ))}
        </div>
        {MACROS.map(
          (macro) =>
            fieldErrors[macro] && (
              <p key={macro} className={FIELD_ERROR}>
                {tLabels(MACRO_LABELS[macro].nameKey)}: {fieldErrors[macro]}
              </p>
            ),
        )}
        <p className="mt-1.5 text-xs text-muted">
          {t("foodsHint", {
            carbs: tLabels(MACRO_LABELS.carbs.nameKey),
            carbFoods: tLabels(MACRO_LABELS.carbs.foodsKey),
            protein: tLabels(MACRO_LABELS.protein.nameKey),
            proteinFoods: tLabels(MACRO_LABELS.protein.foodsKey),
            fat: tLabels(MACRO_LABELS.fat.nameKey),
            fatFoods: tLabels(MACRO_LABELS.fat.foodsKey),
          })}
        </p>
      </div>

      {formError && (
        <p role="alert" className={FIELD_ERROR}>
          {formError}
        </p>
      )}

      <SubmitButton
        className={`${BUTTON_PRIMARY} w-full`}
        isPending={isPending}
      >
        {entry ? t("saveChanges") : t("logMeal")}
      </SubmitButton>
    </form>
  );
};
