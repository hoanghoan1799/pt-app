import {
  Flag,
  MessageCircle,
  Newspaper,
  UserCog,
  Utensils,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { ScrollToTopButton } from "@/components/common/ScrollToTopButton";
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
import { getOwnAvatarUrl } from "@/features/avatar/services/own-avatar";
import { AdminUnreadBadge } from "@/features/chat/components/UnreadBadge";
import { loadAdminAccountColor } from "@/features/chat/services/chat-profile";
import { loadAdminUnread } from "@/features/chat/services/chat-queries";
import { MemberProgressList } from "@/features/dashboard/components/MemberProgressList";
import { PtFilterSelect } from "@/features/dashboard/components/PtFilterSelect";
import { RecentActivityList } from "@/features/dashboard/components/RecentActivityList";
import { WeekSummaryTiles } from "@/features/dashboard/components/WeekSummaryTiles";
import { RECENT_ACTIVITY_LIMIT } from "@/features/dashboard/constants/dashboard";
import {
  getMemberProgress,
  getRecentActivity,
} from "@/features/dashboard/services/dashboard-api";
import { parsePtFilter } from "@/features/dashboard/utils/pt-filter";
import {
  summarizeWeek,
  toMemberRows,
} from "@/features/dashboard/utils/summary";
import { AddMemberButton } from "@/features/members/components/AddMemberButton";
import { listPtOptions } from "@/features/pts/services/pt-queries";
import { countOpenReports } from "@/features/social/services/social-queries";
import { adminProfilePath } from "@/features/social/utils/post-rules";
import { isSuperAdmin } from "@/services/admin-scope";
import { requireAdmin } from "@/services/auth-guard";
import { getAdminUserPath } from "@/utils/routes";
import { readSearchParam } from "@/utils/search-params";
import { getRequestTime } from "@/utils/time";
import { getTodayDate, resolveSchedule } from "@/utils/week";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("adminPages.home");

  return { title: t("metaTitle") };
};

const TILE =
  "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-2 py-3 text-center text-sm font-semibold text-fg transition active:bg-line/60";

const getMemberHref = (memberId: number, weekStart: string) =>
  `${getAdminUserPath(memberId)}?${new URLSearchParams({ week: weekStart })}`;

const AdminDashboardPage = async ({ searchParams }: PageProps<"/admin">) => {
  const admin = await requireAdmin();
  const t = await getTranslations("adminPages.home");
  const locale = await getLocale();
  const query = await searchParams;
  const today = getTodayDate(TIME_ZONE);
  const now = getRequestTime();
  const schedule = resolveSchedule(
    { week: readSearchParam(query.week) },
    today,
  );
  const isSuper = isSuperAdmin(admin);
  // Only a super admin can filter by PT; a PT is already scoped to their own.
  const ptFilter = isSuper ? parsePtFilter(readSearchParam(query.pt)) : "all";
  const [
    ptOptions,
    members,
    activity,
    unread,
    avatarUrl,
    accountColor,
    openReports,
  ] = await Promise.all([
    isSuper ? listPtOptions() : Promise.resolve([]),
    getMemberProgress(schedule.weekStart, ptFilter),
    getRecentActivity({ limit: RECENT_ACTIVITY_LIMIT }),
    loadAdminUnread(),
    getOwnAvatarUrl("admin"),
    loadAdminAccountColor(),
    isSuperAdmin(admin) ? countOpenReports() : 0,
  ]);
  const unreadMessages = unread.count;
  const unreadByTrainee = unread.perTrainee;
  const rows = toMemberRows(members, {
    weekStart: schedule.weekStart,
    timeZone: TIME_ZONE,
    now,
    getHref: getMemberHref,
    locale,
    unreadByUserId: new Map(
      unreadByTrainee.map((row) => [row.userId, row.unread]),
    ),
  });

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow", { username: admin.username })}
        title={t("title")}
        actions={
          <>
            <Link
              href={ROUTES.ADMIN_MESSAGES}
              className={`${ICON_BUTTON} relative text-fg`}
              aria-label={t("tiles.messages")}
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
              profileHref={adminProfilePath("admin", admin.id)}
            />
          </>
        }
      />
      <main
        className={`${PAGE_CONTAINER} space-y-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        {!isSuper && (
          <h2 className="text-lg font-bold text-fg">
            {t("workspace", { username: admin.username })}
          </h2>
        )}
        <section className="space-y-2" aria-labelledby="admin-actions-title">
          <h2 id="admin-actions-title" className={SECTION_TITLE}>
            {t("actions")}
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <AddMemberButton
              className={TILE}
              ptOptions={isSuper ? ptOptions : undefined}
            />
            {isSuper && (
              <>
                <Link href={ROUTES.ADMIN_FOODS} className={TILE}>
                  <Utensils className="size-6 text-accent" aria-hidden />
                  <span>{t("tiles.foods")}</span>
                </Link>
                <Link href={ROUTES.ADMIN_PTS} className={TILE}>
                  <UserCog className="size-6 text-accent" aria-hidden />
                  <span>{t("tiles.pts")}</span>
                </Link>
                <Link
                  href={ROUTES.ADMIN_REPORTS}
                  className={`${TILE} relative`}
                >
                  <Flag className="size-6 text-accent" aria-hidden />
                  <span>{t("tiles.reports")}</span>
                  {openReports > 0 && (
                    <span className="absolute top-2 right-2 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs leading-5 font-bold text-white">
                      {openReports > 99 ? "99+" : openReports}
                    </span>
                  )}
                </Link>
              </>
            )}
            <Link href={ROUTES.ADMIN_SOCIAL} className={TILE}>
              <Newspaper className="size-6 text-accent" aria-hidden />
              <span>{t("tiles.social")}</span>
            </Link>
            <Link href={ROUTES.ADMIN_MESSAGES} className={`${TILE} relative`}>
              <MessageCircle className="size-6 text-accent" aria-hidden />
              <span>{t("tiles.messages")}</span>
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
          <h2 className={SECTION_TITLE}>
            {t("usersCount", { count: members.length })}
          </h2>
          {isSuper && (
            <PtFilterSelect value={String(ptFilter)} options={ptOptions} />
          )}
          <MemberProgressList
            members={rows}
            hasPasscode={admin.hasPasscode}
            isPtShown={isSuper}
          />
        </section>
        <section className="space-y-2">
          <h2 className={SECTION_TITLE}>{t("recentActivity")}</h2>
          <RecentActivityList items={activity} isUserShown now={now} />
        </section>
      </main>
      <ScrollToTopButton />
    </>
  );
};

export default AdminDashboardPage;
