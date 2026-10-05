import { Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { ICON_BUTTON, PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { DeleteMemberButton } from "@/features/members/components/DeleteMemberButton";
import { listMembers } from "@/features/members/services/member-queries";
import { CopyWeekButton } from "@/features/workouts/components/CopyWeekButton";
import { WorkoutWeekEditor } from "@/features/workouts/components/WorkoutWeekEditor";
import { getWeekSchedule } from "@/features/workouts/services/workout-queries";
import {
  addDays,
  buildScheduleHref,
  getTodayDate,
  resolveSchedule,
} from "@/features/workouts/utils/week";
import { requireAdmin } from "@/services/auth-guard";
import { findUserById } from "@/services/users";
import { getAdminPreviewPath, getAdminUserPath } from "@/utils/routes";
import { readSearchParam } from "@/utils/search-params";

export const metadata: Metadata = { title: "Lịch tập" };

const AdminUserPage = async ({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]">) => {
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
  const [days, members] = await Promise.all([
    getWeekSchedule(user.id, schedule.weekStart),
    listMembers(),
  ]);

  return (
    <>
      <AppHeader
        eyebrow="Lịch tập của"
        title={user.name}
        backHref={ROUTES.ADMIN}
        actions={
          <Link
            href={buildScheduleHref(getAdminPreviewPath(user.id), schedule)}
            className={`${ICON_BUTTON} text-fg`}
            aria-label="Xem như user"
          >
            <Eye className="size-5" />
          </Link>
        }
      />
      {/* Bottom padding clears the fixed "Thêm bài tập" bar. */}
      <main
        className={`${PAGE_CONTAINER} space-y-8 pt-4 pb-[calc(env(safe-area-inset-bottom)+7rem)]`}
      >
        <WorkoutWeekEditor
          userId={user.id}
          basePath={getAdminUserPath(user.id)}
          days={days}
          weekStart={schedule.weekStart}
          selectedDate={schedule.selectedDate}
          today={today}
        />
        <section className="space-y-3 border-t border-line pt-6">
          <h2 className={SECTION_TITLE}>Công cụ</h2>
          <CopyWeekButton
            userId={user.id}
            weekStart={schedule.weekStart}
            defaultTargetDate={addDays(schedule.weekStart, 7)}
            members={members}
          />
          <DeleteMemberButton userId={user.id} />
        </section>
      </main>
    </>
  );
};

export default AdminUserPage;
