import { DayTabs } from "@/features/workouts/components/DayTabs";
import { DayView } from "@/features/workouts/components/DayView";
import { WeekNavigator } from "@/features/workouts/components/WeekNavigator";
import type { ScheduleDay } from "@/features/workouts/types/workout";

interface WorkoutWeekProps {
  basePath: string;
  days: ScheduleDay[];
  weekStart: string;
  selectedDate: string;
  today: string;
}

// The read-only week a user sees; also used for the admin's "view as user".
export const WorkoutWeek = ({
  basePath,
  days,
  weekStart,
  selectedDate,
  today,
}: WorkoutWeekProps) => {
  const selectedDay = days.find((day) => day.date === selectedDate) ?? days[0];

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <WeekNavigator
          basePath={basePath}
          weekStart={weekStart}
          selectedDate={selectedDate}
          today={today}
        />
        <DayTabs
          basePath={basePath}
          weekStart={weekStart}
          days={days}
          selectedDate={selectedDate}
          today={today}
        />
      </div>
      <DayView day={selectedDay} isToday={selectedDay.date === today} />
    </div>
  );
};
