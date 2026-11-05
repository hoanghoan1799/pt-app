import { MessageCircle, Utensils } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { WeekNavigator } from "@/components/common/WeekNavigator";
import { AppHeader } from "@/components/layout/AppHeader";
import { HeaderMenus } from "@/components/layout/HeaderMenus";
import { ROUTES } from "@/constants/routes";
import { ICON_BUTTON, PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { UnreadBadge } from "@/features/chat/components/UnreadBadge";
import { countUnreadForAdmin } from "@/features/chat/services/chat-queries";
import { MemberProgressList } from "@/features/dashboard/components/MemberProgressList";
import { RecentActivityList } from "@/features/dashboard/components/RecentActivityList";
import { StatTile } from "@/features/dashboard/components/StatTile";
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
  const [members, activity, unreadMessages] = await Promise.all([
    getMemberProgress(schedule.weekStart),
    getRecentActivity({ limit: RECENT_ACTIVITY_LIMIT }),
    countUnreadForAdmin(admin.id),
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
            <Link
              href={ROUTES.ADMIN_MESSAGES}
              className={`${ICON_BUTTON} relative text-fg`}
              aria-label="Tin nhắn"
            >
              <MessageCircle className="size-5" />
              <UnreadBadge
                count={unreadMessages}
                className="absolute top-1 right-1"
              />
            </Link>
            <HeaderMenus role="admin" />
          </>
        }
      />
      <main
        className={`${PAGE_CONTAINER} space-y-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        {/* Temporary home of the two actions that left the header; the
            "Thao tác" tiles of KAN-124 replace this row. */}
        <div className="flex items-center gap-2">
          <Link
            href={ROUTES.ADMIN_FOODS}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-fg"
          >
            <Utensils className="size-5" aria-hidden />
            Thực phẩm
          </Link>
          <AddMemberButton />
        </div>
        <div className="space-y-3">
          <WeekNavigator
            basePath={ROUTES.ADMIN}
            weekStart={schedule.weekStart}
            selectedDate={schedule.selectedDate}
            today={today}
          />
          <WeekSummaryTiles summary={summarizeWeek(members)} />
          <Link href={ROUTES.ADMIN_MESSAGES} className="block">
            <StatTile
              icon={MessageCircle}
              label="Tin nhắn chưa đọc"
              value={String(unreadMessages)}
              hint={
                unreadMessages > 0
                  ? "Chạm để mở hộp thư"
                  : "Đã đọc hết tin nhắn"
              }
            />
          </Link>
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
