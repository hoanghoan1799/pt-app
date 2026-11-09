import type { ReactNode } from "react";

import { WeekNavigator } from "@/components/common/WeekNavigator";
import { CARD, SECTION_TITLE } from "@/constants/styles";
import { NutritionWeekSummary } from "@/features/nutrition/components/NutritionWeekSummary";
import { WeightTrendCard } from "@/features/nutrition/components/WeightTrendCard";
import type {
  NutritionDay,
  WeeklyWeight,
} from "@/features/nutrition/types/nutrition";
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
  weightWeeks: WeeklyWeight[];
  // Users log their own weight here; the admin only reads.
  canLogWeight: boolean;
  todayWeight: number | null;
  // Admin-only "Tiến bộ" section, placed between the weight chart and the
  // workouts; the user app passes nothing.
  progress?: ReactNode;
  // Trainee only: the body stats & TDEE card, shown under the weight chart.
  bodyProfile?: ReactNode;
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
  weightWeeks,
  canLogWeight,
  todayWeight,
  progress,
  bodyProfile,
}: WeekSummaryProps) => (
  <div className="space-y-6">
    <div className={`${CARD} p-4`}>
      <WeekNavigator
        basePath={basePath}
        weekStart={weekStart}
        selectedDate={selectedDate}
        today={today}
      />
    </div>
    <section className="space-y-2">
      <h2 className={SECTION_TITLE}>Cân nặng theo tuần</h2>
      <WeightTrendCard
        weeks={weightWeeks}
        selectedWeekStart={weekStart}
        canLog={canLogWeight}
        todayWeight={todayWeight}
      />
    </section>
    {bodyProfile}
    {progress != null && (
      <section className="space-y-2">
        <h2 className={SECTION_TITLE}>Tiến bộ</h2>
        {progress}
      </section>
    )}
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
