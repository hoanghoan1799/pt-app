import { Eye } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { WorkoutWeek } from "@/features/workouts/components/WorkoutWeek";
import { getWeekSchedule } from "@/features/workouts/services/workout-queries";
import { requireAdmin } from "@/services/auth-guard";
import { findUserById } from "@/services/users";
import { getAdminPreviewPath, getAdminUserPath } from "@/utils/routes";
import { readSearchParam } from "@/utils/search-params";
import { buildScheduleHref, getTodayDate, resolveSchedule } from "@/utils/week";

export const metadata: Metadata = { title: "Xem như user" };

const AdminPreviewPage = async ({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]/preview">) => {
  await requireAdmin();

  const { id } = await params;
  const user = await findUserById(Number(id));

  if (!user) {
    notFound();
  }

  const query = await searchParams;
  const today = getTodayDate(TIME_ZONE);
  const schedule = resolveSchedule(
    { week: readSearchParam(query.week), day: readSearchParam(query.day) },
    today,
  );
  const days = await getWeekSchedule(user.id, schedule.weekStart);

  return (
    <>
      <AppHeader
        eyebrow="Xem như user"
        title={user.name}
        backHref={buildScheduleHref(getAdminUserPath(user.id), schedule)}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <p className="flex items-center gap-2 rounded-xl bg-accent/12 px-3 py-2.5 text-sm font-medium text-accent">
          <Eye className="size-4 shrink-0" aria-hidden />
          Đây là màn hình user sẽ thấy
        </p>
        <WorkoutWeek
          basePath={getAdminPreviewPath(user.id)}
          days={days}
          weekStart={schedule.weekStart}
          selectedDate={schedule.selectedDate}
          today={today}
          isInteractive={false}
        />
      </main>
    </>
  );
};

export default AdminPreviewPage;
