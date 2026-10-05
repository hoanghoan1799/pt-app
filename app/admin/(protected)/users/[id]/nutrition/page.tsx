import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import { MemberSectionTabs } from "@/components/layout/MemberSectionTabs";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { NutritionTargetCard } from "@/features/nutrition/components/NutritionTargetCard";
import { NutritionWeek } from "@/features/nutrition/components/NutritionWeek";
import {
  getLatestTarget,
  getNutritionWeek,
} from "@/features/nutrition/services/nutrition-queries";
import { requireAdmin } from "@/services/auth-guard";
import { findUserById } from "@/services/users";
import { getAdminNutritionPath } from "@/utils/routes";
import { readSearchParam } from "@/utils/search-params";
import { getTodayDate, resolveSchedule } from "@/utils/week";

export const metadata: Metadata = { title: "Dinh dưỡng" };

const AdminNutritionPage = async ({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]/nutrition">) => {
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
  const [days, latestTarget] = await Promise.all([
    getNutritionWeek(user.id, schedule.weekStart),
    getLatestTarget(user.id),
  ]);

  return (
    <>
      <AppHeader
        eyebrow="Dinh dưỡng của"
        title={user.name}
        backHref={`${ROUTES.ADMIN}?${new URLSearchParams({ week: schedule.weekStart })}`}
      />
      <MemberSectionTabs
        userId={user.id}
        active="nutrition"
        weekStart={schedule.weekStart}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <NutritionTargetCard userId={user.id} target={latestTarget} />
        <NutritionWeek
          basePath={getAdminNutritionPath(user.id)}
          days={days}
          weekStart={schedule.weekStart}
          selectedDate={schedule.selectedDate}
          today={today}
          isEditable={false}
        />
      </main>
    </>
  );
};

export default AdminNutritionPage;
