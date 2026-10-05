import { WeekDayTabs } from "@/components/common/WeekDayTabs";
import type { ScheduleDay } from "@/features/workouts/types/workout";
import { isDayComplete } from "@/features/workouts/utils/progress";

interface DayTabsProps {
  basePath: string;
  weekStart: string;
  days: ScheduleDay[];
  selectedDate: string;
  today: string;
}

const getMarker = (day: ScheduleDay) => {
  if (isDayComplete(day)) {
    return "check";
  }
  return day.exercises.length > 0 ? "dot" : "none";
};

export const DayTabs = ({ days, ...props }: DayTabsProps) => (
  <WeekDayTabs
    {...props}
    items={days.map((day) => ({
      date: day.date,
      marker: getMarker(day),
      description: `${day.exercises.length ? `, ${day.exercises.length} bài` : ""}${isDayComplete(day) ? ", đã tập xong" : ""}`,
    }))}
  />
);
