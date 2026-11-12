"use client";

import { MEAL_COUNT_LIMITS, MEAL_PLAN_LIMITS } from "@pt/contracts";
import { ChevronDown, Utensils } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { SubmitButton } from "@/components/common/SubmitButton";
import {
  BUTTON_PRIMARY,
  CARD,
  FIELD_ERROR,
  INPUT,
  LABEL,
  TEXTAREA,
} from "@/constants/styles";
import { useMealPreferencesForm } from "@/features/meal-plans/hooks/use-meal-preferences-form";
import { hasMealPreferences } from "@/features/meal-plans/utils/meal-preferences";

interface MealPreferencesFormProps {
  preferredMealCount: number | null;
  foodNote: string | null;
}

const COUNTS = Array.from(
  { length: MEAL_COUNT_LIMITS.max - MEAL_COUNT_LIMITS.min + 1 },
  (_, index) => MEAL_COUNT_LIMITS.min + index,
);

// Q1: the trainee tells the PT how many meals they want and what they like
// or avoid. The card starts open while nothing is saved yet and collapsed
// once the trainee has entered a request; later saves keep it as it is.
export const MealPreferencesForm = ({
  preferredMealCount,
  foodNote,
}: MealPreferencesFormProps) => {
  const t = useTranslations("mealPlans.mealPreferencesForm");
  const { formAction, fieldErrors, values } = useMealPreferencesForm();
  const [isOpen, setIsOpen] = useState(
    () => !hasMealPreferences(preferredMealCount, foodNote),
  );
  const bodyId = useId();

  return (
    <section className={`${CARD} p-4`}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Utensils className="size-4" aria-hidden />
          {t("title")}
        </span>
        <ChevronDown
          className={`size-5 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      <div id={bodyId} hidden={!isOpen}>
        <form action={formAction} className="mt-3 space-y-4">
          <div>
            <label htmlFor="meal-count" className={LABEL}>
              {t("mealCount")}
            </label>
            <select
              id="meal-count"
              name="mealCount"
              defaultValue={
                values?.mealCount ?? String(preferredMealCount ?? "")
              }
              aria-invalid={Boolean(fieldErrors.mealCount)}
              className={INPUT}
            >
              <option value="">{t("ptDecides")}</option>
              {COUNTS.map((count) => (
                <option key={count} value={count}>
                  {t("mealsPerDay", { count })}
                </option>
              ))}
            </select>
            {fieldErrors.mealCount && (
              <p className={FIELD_ERROR}>{fieldErrors.mealCount}</p>
            )}
          </div>
          <div>
            <label htmlFor="food-note" className={LABEL}>
              {t("foodLabel")}
            </label>
            <textarea
              id="food-note"
              name="foodNote"
              defaultValue={values?.foodNote ?? foodNote ?? ""}
              rows={3}
              maxLength={MEAL_PLAN_LIMITS.FOOD_NOTE}
              placeholder={t("notePlaceholder")}
              aria-invalid={Boolean(fieldErrors.foodNote)}
              className={TEXTAREA}
            />
            {fieldErrors.foodNote && (
              <p className={FIELD_ERROR}>{fieldErrors.foodNote}</p>
            )}
          </div>
          <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
            {t("save")}
          </SubmitButton>
        </form>
        <p className="mt-3 text-xs text-muted">{t("hint")}</p>
      </div>
    </section>
  );
};
