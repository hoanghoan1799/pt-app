import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { MemberSectionTabs } from "@/components/layout/MemberSectionTabs";
import { WeekSummary } from "@/components/layout/WeekSummary";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { getTraineeDisplayName } from "@/features/chat/services/chat-queries";
import { ExerciseProgressList } from "@/features/members/components/ExerciseProgressList";
import { getExerciseProgress } from "@/features/members/services/progress-queries";
import { getNutritionOverview } from "@/features/nutrition/services/nutrition-queries";
import { getTraineeWeekSchedule } from "@/features/workouts/services/workout-api";
import { requireAdmin } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";
import { findUserById } from "@/services/users";
import {
  getAdminNutritionPath,
  getAdminSummaryPath,
  getAdminUserPath,
} from "@/utils/routes";
import { readSearchParam } from "@/utils/search-params";
import { getTodayDate, resolveSchedule } from "@/utils/week";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("adminPages.userSummary");

  return { title: t("metaTitle") };
};

const AdminSummaryPage = async ({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]/summary">) => {
  const admin = await requireAdmin();
  const t = await getTranslations("adminPages.userSummary");

  const { id } = await params;
  const user = await findUserById(Number(id));

  if (!user || !(await canAdminAccessUser(admin.id, user.id))) {
    notFound();
  }
  const displayName = await getTraineeDisplayName(admin.id, user);

  const query = await searchParams;
  const today = getTodayDate(TIME_ZONE);
  const schedule = resolveSchedule(
    { week: readSearchParam(query.week), day: readSearchParam(query.day) },
    today,
  );
  const [workoutDays, overview, progressRows] = await Promise.all([
    getTraineeWeekSchedule(user.id, schedule.weekStart),
    getNutritionOverview(schedule.weekStart, user.id),
    getExerciseProgress(user.id, schedule.weekStart),
  ]);

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={displayName}
        backHref={`${ROUTES.ADMIN}?${new URLSearchParams({ week: schedule.weekStart })}`}
      />
      <MemberSectionTabs
        userId={user.id}
        active="summary"
        weekStart={schedule.weekStart}
      />
      <main
        className={`${PAGE_CONTAINER} pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <WeekSummary
          basePath={getAdminSummaryPath(user.id)}
          workoutsPath={getAdminUserPath(user.id)}
          nutritionPath={getAdminNutritionPath(user.id)}
          weekStart={schedule.weekStart}
          selectedDate={schedule.selectedDate}
          today={today}
          workoutDays={workoutDays}
          nutritionDays={overview.days}
          weightWeeks={overview.weightWeeks}
          canLogWeight={false}
          todayWeight={overview.todayWeight}
          progress={<ExerciseProgressList rows={progressRows} />}
        />
      </main>
    </>
  );
};

export default AdminSummaryPage;
