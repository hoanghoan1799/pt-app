import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { WeekCalendarCard } from "@/components/common/WeekCalendarCard";
import type { DayCompletion } from "@/features/meal-plans/utils/day-completion";
import { NutritionDayView } from "@/features/nutrition/components/NutritionDayView";
import type { NutritionDay } from "@/features/nutrition/types/nutrition";

interface NutritionWeekProps {
  basePath: string;
  days: NutritionDay[];
  weekStart: string;
  selectedDate: string;
  today: string;
  isEditable: boolean;
  // The trainee's page: the old free-text log is read-only history (KAN-71).
  isLegacyLog?: boolean;
  // Meal-plan completion per date (green, yellow or grey marker).
  completion: Record<string, DayCompletion>;
  // Shown under the daily goals (the PT's meal plan).
  children?: ReactNode;
}

export const NutritionWeek = ({
  basePath,
  days,
  weekStart,
  selectedDate,
  today,
  isEditable,
  isLegacyLog = false,
  completion,
  children,
}: NutritionWeekProps) => {
  const t = useTranslations("nutrition.nutritionWeek");
  const selectedDay = days.find((day) => day.date === selectedDate) ?? days[0];
  const describeStatus = (status: DayCompletion) => {
    if (status === "complete") {
      return t("completeDescription");
    }
    return status === "partial" ? t("partialDescription") : "";
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <WeekCalendarCard
          basePath={basePath}
          weekStart={weekStart}
          selectedDate={selectedDate}
          today={today}
          items={days.map((day) => ({
            date: day.date,
            status: completion[day.date] ?? "none",
            description: describeStatus(completion[day.date] ?? "none"),
          }))}
        />
      </div>
      <NutritionDayView
        day={selectedDay}
        today={today}
        isEditable={isEditable}
        isLegacyLog={isLegacyLog}
      >
        {children}
      </NutritionDayView>
    </div>
  );
};
