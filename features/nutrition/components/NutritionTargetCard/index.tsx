"use client";

import clsx from "clsx";
import { Pencil, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { BUTTON_PRIMARY, CARD, ICON_BUTTON } from "@/constants/styles";
import { TargetForm } from "@/features/nutrition/components/TargetForm";
import {
  MACRO_COLORS,
  MACRO_LABELS,
  MACROS,
  TARGET_SOURCE_LABEL_KEYS,
} from "@/features/nutrition/constants/nutrition";
import type { NutritionTarget } from "@/features/nutrition/types/nutrition";
import { formatCalories } from "@/features/nutrition/utils/energy";
import { calculateCalories } from "@/features/nutrition/utils/nutrition";
import { formatDayMonth } from "@/utils/week";

interface NutritionTargetCardProps {
  userId: number;
  target: NutritionTarget | null;
}

// A plain open/closed toggle around the form, so no separate hook/view.
export const NutritionTargetCard = ({
  userId,
  target,
}: NutritionTargetCardProps) => {
  const t = useTranslations("nutrition.nutritionTargetCard");
  const tLabels = useTranslations("nutrition.labels");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className={`${CARD} p-4`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Target className="size-4" aria-hidden />
            {t("dailyTarget")}
          </p>
          {target && (
            <p className="mt-0.5 text-xs text-muted">
              {t("targetSummary", {
                calories: formatCalories(calculateCalories(target)),
                date: formatDayMonth(target.effectiveFrom),
              })}
              <span
                className={clsx(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  target.source === "tdee"
                    ? "bg-success/15 text-success"
                    : "bg-line text-muted",
                )}
              >
                {tLabels(TARGET_SOURCE_LABEL_KEYS[target.source])}
              </span>
            </p>
          )}
        </div>
        {target && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={`${ICON_BUTTON} -mt-2 -mr-2 text-fg`}
            aria-label={t("editTarget")}
          >
            <Pencil className="size-5" />
          </button>
        )}
      </div>

      {target ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {MACROS.map((macro) => (
            <div
              key={macro}
              className={clsx(
                "rounded-xl px-3 py-2.5",
                MACRO_COLORS[macro].soft,
              )}
            >
              <p
                className={clsx(
                  "text-xs font-semibold",
                  MACRO_COLORS[macro].text,
                )}
              >
                {tLabels(MACRO_LABELS[macro].nameKey)}
              </p>
              <p className="mt-0.5 text-lg leading-tight font-bold text-fg tabular-nums">
                {target[macro]} g
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">{t("empty")}</p>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={`${BUTTON_PRIMARY} w-full`}
          >
            {t("setTarget")}
          </button>
        </div>
      )}

      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title={t("sheetTitle")}
        description={t("sheetDescription")}
      >
        <TargetForm
          userId={userId}
          target={target}
          onSaved={() => setIsOpen(false)}
        />
      </BottomSheet>
    </section>
  );
};
