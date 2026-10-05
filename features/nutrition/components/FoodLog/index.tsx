"use client";

import clsx from "clsx";
import { Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { BUTTON_SECONDARY, CARD, ICON_BUTTON } from "@/constants/styles";
import { FoodEntryForm } from "@/features/nutrition/components/FoodEntryForm";
import {
  MACRO_COLORS,
  MACRO_LABELS,
  MACROS,
  MEAL_LABELS,
  MEALS,
} from "@/features/nutrition/constants/nutrition";
import { useFoodLog } from "@/features/nutrition/hooks/use-food-log";
import type { FoodEntry, Meal } from "@/features/nutrition/types/nutrition";
import { formatFullDay } from "@/utils/week";

interface FoodLogProps {
  date: string;
  entries: FoodEntry[];
  // Users edit their own log (today and earlier); admins only read it.
  isEditable: boolean;
  emptyMessage: string;
}

// Suggests the next meal to log based on what is already there.
const getNextMeal = (entries: FoodEntry[]): Meal =>
  MEALS.find((meal) => !entries.some((entry) => entry.meal === meal)) ??
  "snack";

export const FoodLog = ({
  date,
  entries,
  isEditable,
  emptyMessage,
}: FoodLogProps) => {
  const log = useFoodLog();
  const meals = MEALS.filter((meal) =>
    entries.some((entry) => entry.meal === meal),
  );

  return (
    <section className="space-y-3">
      {meals.length ? (
        meals.map((meal) => (
          <div key={meal} className={`${CARD} overflow-hidden`}>
            <h3 className="border-b border-line px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
              {MEAL_LABELS[meal]}
            </h3>
            <ul className="divide-y divide-line">
              {entries
                .filter((entry) => entry.meal === meal)
                .map((entry) => (
                  <li
                    key={entry.id}
                    className={clsx(
                      "flex items-start gap-2 py-3 pr-2 pl-4 transition-opacity",
                      log.pendingId === entry.id && "opacity-50",
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {entry.description && (
                        <p className="text-[15px] leading-snug whitespace-pre-line text-fg">
                          {entry.description}
                        </p>
                      )}
                      <p className="flex flex-wrap gap-1.5">
                        {MACROS.filter((macro) => entry[macro] !== null).map(
                          (macro) => (
                            <span
                              key={macro}
                              className={clsx(
                                "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                                MACRO_COLORS[macro].soft,
                                MACRO_COLORS[macro].text,
                              )}
                            >
                              {MACRO_LABELS[macro].short} {entry[macro]} g
                            </span>
                          ),
                        )}
                      </p>
                    </div>
                    {isEditable && (
                      <div className="flex shrink-0">
                        <button
                          type="button"
                          onClick={() => log.handleEdit(entry)}
                          className={ICON_BUTTON}
                          aria-label="Sửa bữa ăn"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => log.handleDelete(entry)}
                          disabled={log.pendingId === entry.id}
                          className={`${ICON_BUTTON} text-danger`}
                          aria-label="Xóa bữa ăn"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))
      ) : (
        <div
          className={`${CARD} flex items-center gap-3 px-4 py-5 text-sm text-muted`}
        >
          <UtensilsCrossed className="size-5 shrink-0" aria-hidden />
          {emptyMessage}
        </div>
      )}

      {isEditable && (
        <>
          <button
            type="button"
            onClick={log.handleAdd}
            className={`${BUTTON_SECONDARY} w-full border-dashed`}
          >
            <Plus className="size-5" aria-hidden />
            Ghi bữa ăn
          </button>
          <BottomSheet
            isOpen={log.sheet.isOpen}
            onOpenChange={log.handleSheetChange}
            title={log.sheet.entry ? "Sửa bữa ăn" : "Ghi bữa ăn"}
            description={formatFullDay(date)}
          >
            <FoodEntryForm
              key={log.sheet.formKey}
              entry={log.sheet.entry}
              date={date}
              defaultMeal={getNextMeal(entries)}
              onSaved={log.handleSaved}
            />
          </BottomSheet>
        </>
      )}
    </section>
  );
};
