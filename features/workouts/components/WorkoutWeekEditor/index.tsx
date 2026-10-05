import { DayEditor } from "@/features/workouts/components/DayEditor";
import { DayTabs } from "@/features/workouts/components/DayTabs";
import { WeekNavigator } from "@/features/workouts/components/WeekNavigator";
import type { ScheduleDay } from "@/features/workouts/types/workout";

interface WorkoutWeekEditorProps {
  userId: number;
  basePath: string;
  days: ScheduleDay[];
  weekStart: string;
  selectedDate: string;
  today: string;
}

export const WorkoutWeekEditor = ({
  userId,
  basePath,
  days,
  weekStart,
  selectedDate,
  today,
}: WorkoutWeekEditorProps) => {
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
      <DayEditor
        key={selectedDay.date}
        day={selectedDay}
        userId={userId}
        isToday={selectedDay.date === today}
      />
    </div>
  );
};
