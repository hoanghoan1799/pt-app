import { MessageSquareQuote } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { CARD, SECTION_TITLE } from "@/constants/styles";
import { FoodLog } from "@/features/nutrition/components/FoodLog";
import { MacroProgressList } from "@/features/nutrition/components/MacroProgressList";
import type { NutritionDay } from "@/features/nutrition/types/nutrition";
import { formatFullDay } from "@/utils/week";

interface NutritionDayViewProps {
  day: NutritionDay;
  today: string;
  isEditable: boolean;
  // Old free-text entries: read-only history, hidden when there are none.
  isLegacyLog?: boolean;
  // Rendered under the daily goals, before the old log (the meal plan).
  children?: ReactNode;
}

export const NutritionDayView = ({
  day,
  today,
  isEditable,
  isLegacyLog = false,
  children,
}: NutritionDayViewProps) => {
  const t = useTranslations("nutrition.nutritionDayView");
  const tWeek = useTranslations("common.week");
  const isFuture = day.date > today;
  const getEmptyMessage = () => {
    if (!isEditable) {
      return t("emptyTraineeLog");
    }
    return isFuture ? t("emptyFuture") : t("emptyToday");
  };

  // Old entries are history on the trainee's page and hidden when there are
  // none. The PT's page shows the section too when nothing at all was logged,
  // so the empty message stays true; foods logged in the plan show in its
  // meal cards.
  const showLog = isLegacyLog
    ? day.entries.length > 0
    : day.entries.length > 0 || day.loggedCount === 0;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-muted">
          {formatFullDay(day.date)}
          {day.date === today && (
            <span className="text-accent"> · {tWeek("today")}</span>
          )}
        </p>
        <h2 className="mt-0.5 text-2xl leading-tight font-bold text-fg">
          {day.target ? t("dailyTargets") : t("nutrition")}
        </h2>
      </div>

      <div className={`${CARD} space-y-4 p-4`}>
        {day.target ? (
          <MacroProgressList
            totals={day.totals}
            kcal={day.totalKcal}
            target={day.target}
          />
        ) : (
          <>
            <p className="text-sm text-muted">{t("noTarget")}</p>
            {day.loggedCount > 0 && (
              <MacroProgressList
                totals={day.totals}
                kcal={day.totalKcal}
                target={null}
              />
            )}
          </>
        )}
        {day.target?.note && (
          <p className="flex gap-2 rounded-xl bg-accent/10 px-3 py-2.5 text-sm text-fg">
            <MessageSquareQuote
              className="mt-0.5 size-4 shrink-0 text-accent"
              aria-hidden
            />
            <span className="whitespace-pre-line">{day.target.note}</span>
          </p>
        )}
      </div>

      {children}

      {showLog && (
        <div className="space-y-2">
          <h3 className={SECTION_TITLE}>
            {isLegacyLog ? t("legacyLog") : t("eaten")}
          </h3>
          <FoodLog
            date={day.date}
            entries={day.entries}
            isEditable={isEditable && !isFuture}
            emptyMessage={getEmptyMessage()}
          />
        </div>
      )}
    </section>
  );
};
