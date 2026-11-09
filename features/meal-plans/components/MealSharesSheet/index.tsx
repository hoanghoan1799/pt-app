"use client";

import { useTranslations } from "next-intl";

import { BottomSheet } from "@/components/common/BottomSheet";
import { Spinner } from "@/components/common/Spinner";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_ERROR,
  INPUT,
} from "@/constants/styles";
import { SHARE_TOTAL_PERCENT } from "@/features/meal-plans/constants/meal-plans";
import { useMealShares } from "@/features/meal-plans/hooks/use-meal-shares";
import type { PlanMeal } from "@/features/meal-plans/types/meal-plan";

interface MealSharesSheetProps {
  userId: number;
  dayId: number;
  meals: PlanMeal[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

// Q4: split the day target by percent instead of equally.
const SharesForm = ({
  userId,
  dayId,
  meals,
  onDone,
}: {
  userId: number;
  dayId: number;
  meals: PlanMeal[];
  onDone: () => void;
}) => {
  const t = useTranslations("mealPlans.mealSharesSheet");
  const shares = useMealShares(userId, dayId, meals, onDone);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {meals.map((meal, index) => (
          <li key={meal.id} className="flex items-center gap-3">
            <label
              htmlFor={`share-${meal.id}`}
              className="min-w-0 flex-1 truncate text-[15px] text-fg"
            >
              {meal.name}
            </label>
            <div className="relative w-28">
              <input
                id={`share-${meal.id}`}
                value={shares.texts[index]}
                onChange={(event) => shares.setText(index, event.target.value)}
                inputMode="decimal"
                className={`${INPUT} pr-9 text-right tabular-nums`}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">
                %
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p
        className={
          shares.isValid ? "text-sm text-muted" : `${FIELD_ERROR} mt-0`
        }
        role="status"
      >
        {t("total", {
          total: String(shares.total).replace(".", ","),
          target: SHARE_TOTAL_PERCENT,
        })}
      </p>
      <button
        type="button"
        onClick={shares.save}
        disabled={!shares.isValid || shares.isPending}
        aria-busy={shares.isPending}
        className={`${BUTTON_PRIMARY} w-full`}
      >
        {shares.isPending && <Spinner size="md" />}
        {t("save")}
      </button>
      <button
        type="button"
        onClick={shares.resetToEqual}
        disabled={shares.isPending}
        aria-busy={shares.isPending}
        className={`${BUTTON_SECONDARY} w-full`}
      >
        {t("equal")}
      </button>
    </div>
  );
};

export const MealSharesSheet = ({
  userId,
  dayId,
  meals,
  isOpen,
  onOpenChange,
}: MealSharesSheetProps) => {
  const t = useTranslations("mealPlans.mealSharesSheet");

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
    >
      {isOpen && (
        <SharesForm
          // Remount so the fields start from the saved shares.
          key={meals.map((meal) => `${meal.id}:${meal.sharePercent}`).join("|")}
          userId={userId}
          dayId={dayId}
          meals={meals}
          onDone={() => onOpenChange(false)}
        />
      )}
    </BottomSheet>
  );
};
