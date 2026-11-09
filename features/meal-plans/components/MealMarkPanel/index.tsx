"use client";

import clsx from "clsx";
import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Spinner } from "@/components/common/Spinner";
import { BUTTON_SECONDARY, TEXTAREA } from "@/constants/styles";
import { MEAL_LOG_LIMITS } from "@/features/meal-plans/constants/meal-plans";
import { useMealMark } from "@/features/meal-plans/hooks/use-meal-mark";
import type { MealMark } from "@/features/meal-plans/types/meal-log";

interface MealMarkPanelProps {
  mealId: number;
  mealName: string;
  mark: MealMark | null;
}

// S4: "Đạt" when the meal went as planned, or a note on what was short or over.
export const MealMarkPanel = ({
  mealId,
  mealName,
  mark,
}: MealMarkPanelProps) => {
  const t = useTranslations("mealPlans.mealMarkPanel");
  const state = useMealMark(mealId, mark);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={state.toggleAchieved}
        disabled={state.isPending}
        aria-busy={state.isPending}
        aria-pressed={state.achieved}
        aria-label={t("achieveLabel", { name: mealName })}
        className={clsx(
          BUTTON_SECONDARY,
          "w-full",
          state.achieved && "border-success bg-success/10 text-success",
        )}
      >
        {state.isPending ? (
          <Spinner size="md" />
        ) : (
          <CircleCheck className="size-5" aria-hidden />
        )}
        {state.achieved ? t("achieved") : t("achieve")}
      </button>
      <label htmlFor={`note-${mealId}`} className="sr-only">
        {t("noteLabel", { name: mealName })}
      </label>
      <textarea
        id={`note-${mealId}`}
        value={state.note}
        onChange={(event) => state.setNote(event.target.value)}
        maxLength={MEAL_LOG_LIMITS.MARK_NOTE}
        rows={2}
        placeholder={t("notePlaceholder")}
        className={TEXTAREA}
      />
      {state.isNoteChanged && (
        <button
          type="button"
          onClick={state.saveNote}
          disabled={state.isPending}
          aria-busy={state.isPending}
          className={`${BUTTON_SECONDARY} w-full`}
        >
          {state.isPending && <Spinner size="md" />}
          {t("saveNote")}
        </button>
      )}
    </div>
  );
};
