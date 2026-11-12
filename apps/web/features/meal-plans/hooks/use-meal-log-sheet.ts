"use client";

import {
  MEAL_LOG_LIMITS,
  MEAL_LOG_MESSAGES,
  MEAL_PLAN_MESSAGES,
} from "@pt/contracts";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useFoodPicker } from "@/features/meal-plans/hooks/use-food-picker";
import { useMealPlanAction } from "@/features/meal-plans/hooks/use-meal-plan-action";
import {
  addMealLogAction,
  updateMealLogAction,
} from "@/features/meal-plans/services/meal-log-actions";
import type { MealLog } from "@/features/meal-plans/types/meal-log";
import type { PlanFood } from "@/features/meal-plans/types/meal-plan";
import { normalizeGrams } from "@/features/meal-plans/utils/grams-input";
import {
  parseOptionalNumber,
  toFieldText,
} from "@/features/meal-plans/utils/log-number-input";
import { useLocalizeMessage } from "@/i18n/use-localize-message";

// "search": pick a library food; "amount": its grams; "free": a food typed by
// name. Editing a library food starts at "amount", a free food at "free".
export type LogStep = "search" | "amount" | "free";

const MACRO_FIELDS = ["kcal", "protein", "carbs", "fat"] as const;
type MacroField = (typeof MACRO_FIELDS)[number];

const getMax = (field: MacroField) =>
  field === "kcal" ? MEAL_LOG_LIMITS.MAX_KCAL : MEAL_LOG_LIMITS.MAX_MACRO_GRAMS;

export const useMealLogSheet = (
  mealId: number,
  library: PlanFood[],
  editing: MealLog | null,
  onDone: () => void,
) => {
  const t = useTranslations("mealPlans.useMealLogSheet");
  const localize = useLocalizeMessage();
  const picker = useFoodPicker(library, []);
  const { isPending, run } = useMealPlanAction();
  const [step, setStep] = useState<LogStep>(() => {
    if (!editing) {
      return "search";
    }
    return editing.isFree ? "free" : "amount";
  });
  const [food, setFood] = useState<PlanFood | null>(null);
  const [gramsText, setGramsText] = useState(
    editing ? toFieldText(editing.grams) : "",
  );
  const [name, setName] = useState(editing?.isFree ? editing.name : "");
  const [macros, setMacros] = useState<Record<MacroField, string>>({
    kcal: toFieldText(editing?.typed.kcal ?? null),
    protein: toFieldText(editing?.typed.protein ?? null),
    carbs: toFieldText(editing?.typed.carbs ?? null),
    fat: toFieldText(editing?.typed.fat ?? null),
  });
  const [error, setError] = useState<string | null>(null);

  const pick = (picked: PlanFood) => {
    setFood(picked);
    setStep("amount");
    setError(null);
  };

  const goTo = (next: LogStep) => {
    setStep(next);
    setError(null);
  };

  const setMacro = (field: MacroField, value: string) =>
    setMacros((previous) => ({ ...previous, [field]: value }));

  const finish = (isEdit: boolean) => ({
    successMessage: isEdit ? t("updated") : t("added"),
    onSuccess: onDone,
  });

  const submit = () => {
    const grams = normalizeGrams(gramsText.trim() || "0");

    if (grams === null) {
      setError(localize(MEAL_PLAN_MESSAGES.INVALID_INPUT));
      return;
    }

    if (step === "amount") {
      if (grams <= 0) {
        setError(localize(MEAL_LOG_MESSAGES.GRAMS_REQUIRED));
        return;
      }
      setError(null);
      if (editing) {
        run(
          () => updateMealLogAction({ logId: editing.id, grams }),
          finish(true),
        );
      } else if (food) {
        run(
          () =>
            addMealLogAction({
              kind: "library",
              mealId,
              foodId: food.id,
              grams,
            }),
          finish(false),
        );
      }
      return;
    }

    if (!name.trim()) {
      setError(localize(MEAL_LOG_MESSAGES.NAME_REQUIRED));
      return;
    }

    const numbers = MACRO_FIELDS.map((field) => ({
      field,
      value: parseOptionalNumber(macros[field], getMax(field)),
    }));

    if (numbers.some(({ value }) => value === "invalid")) {
      setError(localize(MEAL_PLAN_MESSAGES.INVALID_INPUT));
      return;
    }
    setError(null);

    const typed = Object.fromEntries(
      numbers.map(({ field, value }) => [field, value]),
    ) as Record<MacroField, number | null>;

    if (editing) {
      run(
        () =>
          updateMealLogAction({
            logId: editing.id,
            customName: name,
            grams,
            ...typed,
          }),
        finish(true),
      );
    } else {
      run(
        () =>
          addMealLogAction({
            kind: "free",
            mealId,
            customName: name,
            grams,
            ...typed,
          }),
        finish(false),
      );
    }
  };

  return {
    step,
    goTo,
    picker,
    pick,
    food,
    gramsText,
    setGramsText,
    name,
    setName,
    macros,
    setMacro,
    error,
    isPending,
    submit,
  };
};
