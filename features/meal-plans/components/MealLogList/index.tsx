"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { ICON_BUTTON } from "@/constants/styles";
import type { MealLog } from "@/features/meal-plans/types/meal-log";
import {
  formatLogGrams,
  formatNutrition,
} from "@/features/meal-plans/utils/meal-log";

interface MealLogListProps {
  logs: MealLog[];
  // Only the trainee edits; the PT reads (no handlers).
  onEdit?: (log: MealLog) => void;
  onRemove?: (log: MealLog) => void;
  isDisabled?: boolean;
}

export const MealLogList = ({
  logs,
  onEdit,
  onRemove,
  isDisabled = false,
}: MealLogListProps) => {
  const t = useTranslations("mealPlans.mealLogList");

  return (
    <ul className="divide-y divide-line">
      {logs.map((log) => (
        <li key={log.id} className="flex items-start gap-2 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug text-fg">
              {log.name}
              {formatLogGrams(log.grams) && (
                <span className="text-muted">
                  {" "}
                  · {formatLogGrams(log.grams)}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted tabular-nums">
              {log.nutrition
                ? formatNutrition(log.nutrition)
                : t("noNutrition")}
            </p>
            {log.isArchived && (
              <p className="mt-0.5 text-xs font-medium text-warning">
                {t("archived")}
              </p>
            )}
          </div>
          {onEdit && !log.isMissingFood && (
            <button
              type="button"
              onClick={() => onEdit(log)}
              disabled={isDisabled}
              className={`${ICON_BUTTON} -my-1`}
              aria-label={t("edit", { name: log.name })}
            >
              <Pencil className="size-4" />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(log)}
              disabled={isDisabled}
              className={`${ICON_BUTTON} -my-1 -mr-2 text-danger`}
              aria-label={t("delete", { name: log.name })}
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
};
