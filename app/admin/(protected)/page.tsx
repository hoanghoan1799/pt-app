import type { Metadata } from "next";

import { WeekNavigator } from "@/components/common/WeekNavigator";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { MemberProgressList } from "@/features/dashboard/components/MemberProgressList";
import { RecentActivityList } from "@/features/dashboard/components/RecentActivityList";
import { WeekSummaryTiles } from "@/features/dashboard/components/WeekSummaryTiles";
import { RECENT_ACTIVITY_LIMIT } from "@/features/dashboard/constants/dashboard";
import {
  getMemberProgress,
  getRecentActivity,
} from "@/features/dashboard/services/dashboard-queries";
import {
  summarizeWeek,
  toMemberRows,
} from "@/features/dashboard/utils/summary";
import { AddMemberButton } from "@/features/members/components/AddMemberButton";
import { requireAdmin } from "@/services/auth-guard";
import { getAdminUserPath } from "@/utils/routes";
import { readSearchParam } from "@/utils/search-params";
import { getRequestTime } from "@/utils/time";
import { getTodayDate, resolveSchedule } from "@/utils/week";

export const metadata: Metadata = { title: "Tổng quan" };

const getMemberHref = (memberId: number, weekStart: string) =>
  `${getAdminUserPath(memberId)}?${new URLSearchParams({ week: weekStart })}`;

const AdminDashboardPage = async ({ searchParams }: PageProps<"/admin">) => {
  const admin = await requireAdmin();
  const query = await searchParams;
  const today = getTodayDate(TIME_ZONE);
  const now = getRequestTime();
  const schedule = resolveSchedule(
    { week: readSearchParam(query.week) },
    today,
  );
  const [members, activity] = await Promise.all([
    getMemberProgress(schedule.weekStart),
    getRecentActivity({ limit: RECENT_ACTIVITY_LIMIT }),
  ]);
  const rows = toMemberRows(members, {
    weekStart: schedule.weekStart,
    timeZone: TIME_ZONE,
    now,
    getHref: getMemberHref,
  });

  return (
    <>
      <AppHeader
        eyebrow={`Admin · ${admin.username}`}
        title="Tổng quan"
        actions={
          <>
            <AddMemberButton />
            <LogoutButton role="admin" />
          </>
        }
      />
      <main
        className={`${PAGE_CONTAINER} space-y-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <div className="space-y-3">
          <WeekNavigator
            basePath={ROUTES.ADMIN}
            weekStart={schedule.weekStart}
            selectedDate={schedule.selectedDate}
            today={today}
          />
          <WeekSummaryTiles summary={summarizeWeek(members)} />
        </div>
        <section className="space-y-2">
          <h2 className={SECTION_TITLE}>User · {members.length}</h2>
          <MemberProgressList members={rows} />
        </section>
        <section className="space-y-2">
          <h2 className={SECTION_TITLE}>Hoạt động gần đây</h2>
          <RecentActivityList items={activity} isUserShown now={now} />
        </section>
      </main>
    </>
  );
};

export default AdminDashboardPage;
