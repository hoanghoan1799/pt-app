import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { WeekSummary } from "@/components/layout/WeekSummary";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { UserHeaderActions } from "@/features/auth/components/UserHeaderActions";
import { BodyProfileCard } from "@/features/nutrition/components/BodyProfileCard";
import { WEIGHT_CHART_WEEKS } from "@/features/nutrition/constants/weight";
import { getBodyProfile } from "@/features/nutrition/services/body-profile-queries";
import {
  getTodayWeight,
  getWeightTrend,
} from "@/features/nutrition/services/body-profile-service";
import {
  getLatestTarget,
  getNutritionWeek,
} from "@/features/nutrition/services/nutrition-queries";
import { getWeekSchedule } from "@/features/workouts/services/workout-queries";
import { requireUser } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";
import { getTodayDate, resolveSchedule } from "@/utils/week";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("pages.summary");

  return { title: t("metaTitle") };
};

const SummaryPage = async ({ searchParams }: PageProps<"/summary">) => {
  const user = await requireUser();
  const t = await getTranslations("pages.summary");
  const params = await searchParams;
  const today = getTodayDate(TIME_ZONE);
  const schedule = resolveSchedule(
    { week: readSearchParam(params.week), day: readSearchParam(params.day) },
    today,
  );
  const [
    workoutDays,
    nutritionDays,
    weightWeeks,
    todayWeight,
    bodyProfile,
    latestTarget,
  ] = await Promise.all([
    getWeekSchedule(user.id, schedule.weekStart),
    getNutritionWeek(user.id, schedule.weekStart),
    getWeightTrend(user.id, schedule.weekStart, WEIGHT_CHART_WEEKS),
    getTodayWeight(user.id, today),
    getBodyProfile(user.id),
    getLatestTarget(user.id),
  ]);

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={user.name}
        actions={<UserHeaderActions />}
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
          weightWeeks={weightWeeks}
          canLogWeight={true}
          todayWeight={todayWeight}
          bodyProfile={
            <BodyProfileCard
              editor="user"
              profile={bodyProfile}
              isTargetManual={latestTarget?.source === "manual"}
              today={today}
            />
          }
        />
      </main>
    </>
  );
};

export default SummaryPage;
