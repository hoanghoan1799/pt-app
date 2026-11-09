import { DayEditor } from "@/features/workouts/components/DayEditor";
import { DayTabs } from "@/features/workouts/components/DayTabs";
import { WeekProgress } from "@/features/workouts/components/WeekProgress";
import type { ScheduleDayWithSets } from "@/features/workouts/types/workout";
import { getWeekProgress } from "@/features/workouts/utils/progress";
import { hasDayContent } from "@/features/workouts/utils/schedule";

interface WorkoutWeekEditorProps {
  userId: number;
  basePath: string;
  days: ScheduleDayWithSets[];
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

  const datesWithPlan = days.filter(hasDayContent).map((day) => day.date);
  const datesWithLogs = days
    .filter((day) => day.exercises.some((item) => item.loggedSets.length > 0))
    .map((day) => day.date);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <DayTabs
          basePath={basePath}
          weekStart={weekStart}
          days={days}
          selectedDate={selectedDate}
          today={today}
        />
        <WeekProgress progress={getWeekProgress(days)} />
      </div>
      <DayEditor
        key={selectedDay.date}
        day={selectedDay}
        userId={userId}
        isToday={selectedDay.date === today}
        today={today}
        datesWithPlan={datesWithPlan}
        datesWithLogs={datesWithLogs}
      />
    </div>
  );
};
