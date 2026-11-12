import { Eye } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { getTraineeDisplayName } from "@/features/chat/services/chat-queries";
import { WorkoutWeek } from "@/features/workouts/components/WorkoutWeek";
import { getTraineeWeekSchedule } from "@/features/workouts/services/workout-api";
import { requireAdmin } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";
import { findUserById } from "@/services/users";
import { getAdminPreviewPath, getAdminUserPath } from "@/utils/routes";
import { readSearchParam } from "@/utils/search-params";
import { buildScheduleHref, getTodayDate, resolveSchedule } from "@/utils/week";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("adminPages.userPreview");

  return { title: t("metaTitle") };
};

const AdminPreviewPage = async ({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]/preview">) => {
  const admin = await requireAdmin();
  const t = await getTranslations("adminPages.userPreview");

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
  const days = await getTraineeWeekSchedule(user.id, schedule.weekStart);

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={displayName}
        backHref={buildScheduleHref(getAdminUserPath(user.id), schedule)}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <p className="flex items-center gap-2 rounded-xl bg-accent/12 px-3 py-2.5 text-sm font-medium text-accent">
          <Eye className="size-4 shrink-0" aria-hidden />
          {t("notice")}
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
