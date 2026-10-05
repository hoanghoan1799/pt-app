import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { WorkoutWeek } from "@/features/workouts/components/WorkoutWeek";
import { getWeekSchedule } from "@/features/workouts/services/workout-queries";
import { getTodayDate, resolveSchedule } from "@/features/workouts/utils/week";
import { requireUser } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";

export const metadata: Metadata = { title: "Lịch tập" };

const WorkoutsPage = async ({ searchParams }: PageProps<"/workouts">) => {
  const user = await requireUser();
  const params = await searchParams;
  const today = getTodayDate(TIME_ZONE);
  const { weekStart, selectedDate } = resolveSchedule(
    { week: readSearchParam(params.week), day: readSearchParam(params.day) },
    today,
  );
  const days = await getWeekSchedule(user.id, weekStart);

  return (
    <>
      <AppHeader
        eyebrow="Xin chào"
        title={user.name}
        actions={<LogoutButton role="user" />}
      />
      <main
        className={`${PAGE_CONTAINER} pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <WorkoutWeek
          basePath={ROUTES.WORKOUTS}
          days={days}
          weekStart={weekStart}
          selectedDate={selectedDate}
          today={today}
        />
      </main>
    </>
  );
};

export default WorkoutsPage;
