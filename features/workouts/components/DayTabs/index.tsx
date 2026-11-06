import { WeekCalendarCard } from "@/components/common/WeekCalendarCard";
import type { WeekDayStatus } from "@/components/common/WeekDayTabs";
import type { ScheduleDay } from "@/features/workouts/types/workout";
import {
  getDayProgress,
  isDayComplete,
} from "@/features/workouts/utils/progress";

interface DayTabsProps {
  basePath: string;
  weekStart: string;
  days: ScheduleDay[];
  selectedDate: string;
  today: string;
}

// Green: every exercise done; orange: some done; none otherwise.
const getStatus = (day: ScheduleDay): WeekDayStatus => {
  if (isDayComplete(day)) {
    return "complete";
  }
  return getDayProgress(day).completed > 0 ? "partial" : "none";
};

// The workout week calendar (header, days, legend).
export const DayTabs = ({ days, ...props }: DayTabsProps) => (
  <WeekCalendarCard
    {...props}
    items={days.map((day) => ({
      date: day.date,
      status: getStatus(day),
      description: `${day.exercises.length ? `, ${day.exercises.length} bài` : ""}${isDayComplete(day) ? ", đã tập xong" : ""}`,
    }))}
  />
);
