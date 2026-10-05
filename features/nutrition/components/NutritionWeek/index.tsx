import { WeekDayTabs } from "@/components/common/WeekDayTabs";
import { WeekNavigator } from "@/components/common/WeekNavigator";
import { NutritionDayView } from "@/features/nutrition/components/NutritionDayView";
import type { NutritionDay } from "@/features/nutrition/types/nutrition";
import { isDayOnTarget } from "@/features/nutrition/utils/nutrition";

interface NutritionWeekProps {
  basePath: string;
  days: NutritionDay[];
  weekStart: string;
  selectedDate: string;
  today: string;
  isEditable: boolean;
}

const getMarker = (day: NutritionDay) => {
  if (isDayOnTarget(day)) {
    return "check";
  }
  return day.entries.length ? "dot" : "none";
};

export const NutritionWeek = ({
  basePath,
  days,
  weekStart,
  selectedDate,
  today,
  isEditable,
}: NutritionWeekProps) => {
  const selectedDay = days.find((day) => day.date === selectedDate) ?? days[0];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <WeekNavigator
          basePath={basePath}
          weekStart={weekStart}
          selectedDate={selectedDate}
          today={today}
        />
        <WeekDayTabs
          basePath={basePath}
          weekStart={weekStart}
          selectedDate={selectedDate}
          today={today}
          items={days.map((day) => ({
            date: day.date,
            marker: getMarker(day),
            description: `${day.entries.length ? `, ${day.entries.length} bữa đã ghi` : ""}${isDayOnTarget(day) ? ", đạt mục tiêu" : ""}`,
          }))}
        />
      </div>
      <NutritionDayView
        day={selectedDay}
        today={today}
        isEditable={isEditable}
      />
    </div>
  );
};
