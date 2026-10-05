import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { WeekSummary } from "@/components/layout/WeekSummary";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { getNutritionWeek } from "@/features/nutrition/services/nutrition-queries";
import { getWeekSchedule } from "@/features/workouts/services/workout-queries";
import { requireUser } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";
import { getTodayDate, resolveSchedule } from "@/utils/week";

export const metadata: Metadata = { title: "Tổng kết" };

const SummaryPage = async ({ searchParams }: PageProps<"/summary">) => {
  const user = await requireUser();
  const params = await searchParams;
  const today = getTodayDate(TIME_ZONE);
  const schedule = resolveSchedule(
    { week: readSearchParam(params.week), day: readSearchParam(params.day) },
    today,
  );
  const [workoutDays, nutritionDays] = await Promise.all([
    getWeekSchedule(user.id, schedule.weekStart),
    getNutritionWeek(user.id, schedule.weekStart),
  ]);

  return (
    <>
      <AppHeader
        eyebrow="Tổng kết tuần"
        title={user.name}
        actions={<LogoutButton role="user" />}
      />
      <main
        className={`${PAGE_CONTAINER} pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <WeekSummary
          basePath={ROUTES.SUMMARY}
          workoutsPath={ROUTES.WORKOUTS}
          nutritionPath={ROUTES.NUTRITION}
          weekStart={schedule.weekStart}
          selectedDate={schedule.selectedDate}
          today={today}
          workoutDays={workoutDays}
          nutritionDays={nutritionDays}
        />
      </main>
    </>
  );
};

export default SummaryPage;
