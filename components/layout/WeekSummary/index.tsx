import { WeekNavigator } from "@/components/common/WeekNavigator";
import { SECTION_TITLE } from "@/constants/styles";
import { NutritionWeekSummary } from "@/features/nutrition/components/NutritionWeekSummary";
import type { NutritionDay } from "@/features/nutrition/types/nutrition";
import { WorkoutWeekSummary } from "@/features/workouts/components/WorkoutWeekSummary";
import type { ScheduleDay } from "@/features/workouts/types/workout";

interface WeekSummaryProps {
  basePath: string;
  workoutsPath: string;
  nutritionPath: string;
  weekStart: string;
  selectedDate: string;
  today: string;
  workoutDays: ScheduleDay[];
  nutritionDays: NutritionDay[];
}

// The "Tổng kết" tab: a week of training and eating side by side, shared by
// the user app and the admin's view of a member.
export const WeekSummary = ({
  basePath,
  workoutsPath,
  nutritionPath,
  weekStart,
  selectedDate,
  today,
  workoutDays,
  nutritionDays,
}: WeekSummaryProps) => (
  <div className="space-y-6">
    <WeekNavigator
      basePath={basePath}
      weekStart={weekStart}
      selectedDate={selectedDate}
      today={today}
    />
    <section className="space-y-2">
      <h2 className={SECTION_TITLE}>Tập luyện</h2>
      <WorkoutWeekSummary
        days={workoutDays}
        weekStart={weekStart}
        today={today}
        dayBasePath={workoutsPath}
      />
    </section>
    <section className="space-y-2">
      <h2 className={SECTION_TITLE}>Dinh dưỡng</h2>
      <NutritionWeekSummary
        days={nutritionDays}
        weekStart={weekStart}
        dayBasePath={nutritionPath}
      />
    </section>
  </div>
);
