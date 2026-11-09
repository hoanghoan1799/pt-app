"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useMealPlanAction } from "@/features/meal-plans/hooks/use-meal-plan-action";
import { setMealMarkAction } from "@/features/meal-plans/services/meal-log-actions";
import type { MealMark } from "@/features/meal-plans/types/meal-log";

// "Đạt" and the note of one meal. The note is saved only with its own button;
// "Đạt" saves at once with the saved note, so a half-typed note stays a
// draft in the box (KAN-91).
export const useMealMark = (mealId: number, mark: MealMark | null) => {
  const t = useTranslations("mealPlans.useMealMark");
  const { isPending, run } = useMealPlanAction();
  const [note, setNote] = useState(mark?.note ?? "");
  const achieved = mark?.achieved ?? false;

  const save = (nextAchieved: boolean, nextNote: string) =>
    run(
      () =>
        setMealMarkAction({
          mealId,
          achieved: nextAchieved,
          note: nextNote,
        }),
      { successMessage: t("saved") },
    );

  return {
    achieved,
    note,
    setNote,
    isPending,
    isNoteChanged: note.trim() !== (mark?.note ?? ""),
    toggleAchieved: () => save(!achieved, mark?.note ?? ""),
    saveNote: () => save(achieved, note),
  };
};
