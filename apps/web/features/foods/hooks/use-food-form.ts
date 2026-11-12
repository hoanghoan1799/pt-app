"use client";

import { isKcalGapTooLarge, kcalFromMacros } from "@pt/contracts";
import { parseDecimal } from "@pt/contracts";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  type FormEvent,
  startTransition,
  useActionState,
  useState,
} from "react";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { ROUTES } from "@/constants/routes";
import {
  createFoodAction,
  updateFoodAction,
} from "@/features/foods/services/food-actions";
import type { Food } from "@/features/foods/types/food";
import { describeKcalGap, formatKcal } from "@/features/foods/utils/food-math";
import { useFormFeedback } from "@/hooks/use-form-feedback";
import type { FormState } from "@/types/form";

// Empty or non-decimal text gives NaN.
const toNumber = parseDecimal;

const toText = (value: number | undefined) =>
  value === undefined ? "" : String(value);

// Server errors of the last submit. Editing kcal or a macro afterwards makes
// the kcal error stale (it compared the old numbers), so it is dropped.
const getFieldErrors = (state: FormState, isKcalOutdated: boolean) => {
  if (state.status !== "error") {
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
  const { kcal, ...rest } = state.fieldErrors ?? {};

  return isKcalOutdated ? rest : (state.fieldErrors ?? {});
};

export const useFoodForm = (food: Food | null) => {
  const locale = useLocale();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    food ? updateFoodAction : createFoodAction,
    INITIAL_FORM_STATE,
  );
  const [kcal, setKcalText] = useState(toText(food?.kcal));
  const [protein, setProteinText] = useState(toText(food?.protein));
  const [carbs, setCarbsText] = useState(toText(food?.carbs));
  const [fat, setFatText] = useState(toText(food?.fat));
  // The response whose kcal error was outdated by a later edit of the
  // numbers it was about.
  const [outdatedState, setOutdatedState] = useState<typeof state | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);

  // A new food goes back to the list; an edit stays on the page.
  useFormFeedback(state, () => {
    if (!food) {
      router.push(ROUTES.ADMIN_FOODS);
    }
  });

  const withOutdating =
    (setText: (value: string) => void) => (text: string) => {
      setText(text);
      setOutdatedState(state);
      // The "I checked" tick covered the old numbers only.
      setIsConfirmed(false);
    };

  const macros = {
    protein: toNumber(protein),
    carbs: toNumber(carbs),
    fat: toNumber(fat),
  };
  const kcalValue = toNumber(kcal);
  const hasAllNumbers = [kcalValue, ...Object.values(macros)].every(
    (value) => Number.isFinite(value) && value >= 0,
  );
  const kcalCheck = hasAllNumbers
    ? {
        fromMacros: formatKcal(kcalFromMacros(macros), locale),
        isGapTooLarge: isKcalGapTooLarge(kcalValue, macros),
        warning: describeKcalGap(kcalValue, macros, locale),
      }
    : null;

  // Submitted through a transition so React doesn't reset the fields when
  // the server returns validation errors.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(() => formAction(formData));
  };

  return {
    values: { kcal, protein, carbs, fat },
    setKcal: withOutdating(setKcalText),
    setProtein: withOutdating(setProteinText),
    setCarbs: withOutdating(setCarbsText),
    setFat: withOutdating(setFatText),
    isConfirmed,
    setIsConfirmed,
    kcalCheck,
    isPending,
    fieldErrors: getFieldErrors(state, outdatedState === state),
    formError:
      state.status === "error" && !state.fieldErrors
        ? state.message
        : undefined,
    handleSubmit,
  };
};
