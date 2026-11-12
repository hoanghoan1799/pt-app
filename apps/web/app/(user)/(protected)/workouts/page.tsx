import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { UserHeaderActions } from "@/features/auth/components/UserHeaderActions";
import { WorkoutWeek } from "@/features/workouts/components/WorkoutWeek";
import { getMyWeekSchedule } from "@/features/workouts/services/workout-api";
import { requireUser } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";
import { getTodayDate, resolveSchedule } from "@/utils/week";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("pages.workouts");

  return { title: t("metaTitle") };
};

const WorkoutsPage = async ({ searchParams }: PageProps<"/workouts">) => {
  const user = await requireUser();
  const t = await getTranslations("pages.workouts");
  const params = await searchParams;
  const today = getTodayDate(TIME_ZONE);
  const { weekStart, selectedDate } = resolveSchedule(
    { week: readSearchParam(params.week), day: readSearchParam(params.day) },
    today,
  );
  const days = await getMyWeekSchedule(weekStart);

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
        <WorkoutWeek
          basePath={ROUTES.WORKOUTS}
          days={days}
          weekStart={weekStart}
          selectedDate={selectedDate}
          today={today}
          isInteractive={true}
        />
      </main>
    </>
  );
};

export default WorkoutsPage;
