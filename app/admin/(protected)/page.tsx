import { MessageCircle, Utensils } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { WeekNavigator } from "@/components/common/WeekNavigator";
import { AppHeader } from "@/components/layout/AppHeader";
import { HeaderMenus } from "@/components/layout/HeaderMenus";
import { ROUTES } from "@/constants/routes";
import {
  CARD,
  ICON_BUTTON,
  PAGE_CONTAINER,
  SECTION_TITLE,
} from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { getAvatarUrl } from "@/features/avatar/services/avatar";
import { AdminUnreadBadge } from "@/features/chat/components/UnreadBadge";
import { loadAdminAccountColor } from "@/features/chat/services/chat-profile";
import {
  countUnreadForAdmin,
  listUnreadByTraineeForAdmin,
} from "@/features/chat/services/chat-queries";
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

const TILE =
  "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-2 py-3 text-center text-sm font-semibold text-fg transition active:bg-line/60";

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
  const [
    members,
    activity,
    unreadMessages,
    unreadByTrainee,
    avatarUrl,
    accountColor,
  ] = await Promise.all([
    getMemberProgress(schedule.weekStart, admin.id),
    getRecentActivity({ limit: RECENT_ACTIVITY_LIMIT, adminId: admin.id }),
    countUnreadForAdmin(admin.id),
    listUnreadByTraineeForAdmin(admin.id),
    getAvatarUrl("admin", admin.id),
    loadAdminAccountColor(admin.id),
  ]);
  const rows = toMemberRows(members, {
    weekStart: schedule.weekStart,
    timeZone: TIME_ZONE,
    now,
    getHref: getMemberHref,
    unreadByUserId: new Map(
      unreadByTrainee.map((row) => [row.userId, row.unread]),
    ),
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
              <AdminUnreadBadge
                initialCount={unreadMessages}
                className="absolute top-1 right-1"
              />
            </Link>
            <HeaderMenus
              role="admin"
              name={admin.username}
              avatarUrl={avatarUrl}
              accountColor={accountColor}
              isPresenceHidden={admin.presenceHidden}
              hasPasscode={admin.hasPasscode}
            />
          </>
        }
      />
      <main
        className={`${PAGE_CONTAINER} space-y-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <section className="space-y-2" aria-labelledby="admin-actions-title">
          <h2 id="admin-actions-title" className={SECTION_TITLE}>
            Thao tác
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <AddMemberButton className={TILE} />
            <Link href={ROUTES.ADMIN_FOODS} className={TILE}>
              <Utensils className="size-6 text-accent" aria-hidden />
              <span>Thư viện món</span>
            </Link>
            <Link href={ROUTES.ADMIN_MESSAGES} className={`${TILE} relative`}>
              <MessageCircle className="size-6 text-accent" aria-hidden />
              <span>Tin nhắn</span>
              <AdminUnreadBadge
                initialCount={unreadMessages}
                className="absolute top-2 right-2"
              />
            </Link>
          </div>
        </section>
        <div className="space-y-3">
          <div className={`${CARD} p-4`}>
            <WeekNavigator
              basePath={ROUTES.ADMIN}
              weekStart={schedule.weekStart}
              selectedDate={schedule.selectedDate}
              today={today}
            />
          </div>
          <WeekSummaryTiles summary={summarizeWeek(members)} />
        </div>
        <section className="space-y-2">
          <h2 className={SECTION_TITLE}>User · {members.length}</h2>
          <MemberProgressList members={rows} hasPasscode={admin.hasPasscode} />
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
