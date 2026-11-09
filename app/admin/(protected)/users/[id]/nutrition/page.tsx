import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { MemberSectionTabs } from "@/components/layout/MemberSectionTabs";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { getTraineeDisplayName } from "@/features/chat/services/chat-queries";
import { MealPlanDay } from "@/features/meal-plans/components/MealPlanDay";
import { PlanKcalNotices } from "@/features/meal-plans/components/PlanKcalNotices";
import {
  getMealLogData,
  getWeekCompletion,
  listDatesWithLogs,
} from "@/features/meal-plans/services/meal-log-queries";
import {
  countPlanDays,
  getMealPlanWeek,
  getPlanKcalNoticesFrom,
  listPlanDates,
  listPlanFoods,
} from "@/features/meal-plans/services/meal-plan-queries";
import { BodyProfileCard } from "@/features/nutrition/components/BodyProfileCard";
import { NutritionTargetCard } from "@/features/nutrition/components/NutritionTargetCard";
import { NutritionWeek } from "@/features/nutrition/components/NutritionWeek";
import { getBodyProfile } from "@/features/nutrition/services/body-profile-queries";
import {
  getLatestTarget,
  getNutritionWeek,
} from "@/features/nutrition/services/nutrition-queries";
import { requireAdmin } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";
import { findUserById } from "@/services/users";
import { getAdminNutritionPath } from "@/utils/routes";
import { readSearchParam } from "@/utils/search-params";
import { addDays, getTodayDate, resolveSchedule } from "@/utils/week";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("adminPages.userNutrition");

  return { title: t("metaTitle") };
};

const AdminNutritionPage = async ({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]/nutrition">) => {
  const admin = await requireAdmin();
  const t = await getTranslations("adminPages.userNutrition");

  const { id } = await params;
  const user = await findUserById(Number(id));

  if (!user || !(await canAdminAccessUser(admin.id, user.id))) {
    notFound();
  }
  const displayName = await getTraineeDisplayName(user);

  const query = await searchParams;
  const today = getTodayDate(TIME_ZONE);
  const schedule = resolveSchedule(
    { week: readSearchParam(query.week), day: readSearchParam(query.day) },
    today,
  );
  const [
    days,
    latestTarget,
    bodyProfile,
    planDays,
    library,
    lastWeekCount,
    nextWeekPlanDates,
    notices,
    datesWithLogs,
    completion,
  ] = await Promise.all([
    getNutritionWeek(user.id, schedule.weekStart),
    getLatestTarget(user.id),
    getBodyProfile(user.id),
    getMealPlanWeek(user.id, schedule.weekStart),
    listPlanFoods(),
    countPlanDays(user.id, addDays(schedule.weekStart, -7)),
    listPlanDates(
      user.id,
      addDays(schedule.weekStart, 7),
      addDays(schedule.weekStart, 13),
    ),
    getPlanKcalNoticesFrom(user.id, schedule.weekStart),
    listDatesWithLogs(
      user.id,
      schedule.weekStart,
      addDays(schedule.weekStart, 13),
    ),
    getWeekCompletion(user.id, schedule.weekStart),
  ]);
  const selectedPlan =
    planDays.find((day) => day.date === schedule.selectedDate) ?? null;
  const { logs, marks } = await getMealLogData(
    selectedPlan?.meals.map((meal) => meal.id) ?? [],
  );
  const selectedDay = days.find((day) => day.date === schedule.selectedDate);

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={displayName}
        backHref={`${ROUTES.ADMIN}?${new URLSearchParams({ week: schedule.weekStart })}`}
      />
      <MemberSectionTabs
        userId={user.id}
        active="nutrition"
        weekStart={schedule.weekStart}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <BodyProfileCard
          editor="admin"
          userId={user.id}
          profile={bodyProfile}
          isTargetManual={latestTarget?.source === "manual"}
          today={today}
        />
        <NutritionTargetCard userId={user.id} target={latestTarget} />
        <PlanKcalNotices notices={notices} />
        <NutritionWeek
          basePath={getAdminNutritionPath(user.id)}
          days={days}
          weekStart={schedule.weekStart}
          selectedDate={schedule.selectedDate}
          today={today}
          isEditable={false}
          completion={completion}
        >
          <MealPlanDay
            // A fresh tree per day: sheets and half-typed fields reset.
            key={`${user.id}-${schedule.selectedDate}`}
            userId={user.id}
            date={schedule.selectedDate}
            weekStart={schedule.weekStart}
            plan={selectedPlan}
            target={selectedDay?.target ?? null}
            library={library}
            logs={logs}
            marks={marks}
            preferredMealCount={user.preferredMealCount}
            foodNote={user.foodNote}
            lastWeekPlanCount={lastWeekCount}
            today={today}
            datesWithLogs={datesWithLogs}
            datesWithPlan={[
              ...planDays.map((day) => day.date),
              ...nextWeekPlanDates,
            ]}
          />
        </NutritionWeek>
      </main>
    </>
  );
};

export default AdminNutritionPage;
