import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { RememberUser } from "@/features/auth/components/RememberUser";
import { NutritionWeek } from "@/features/nutrition/components/NutritionWeek";
import { getNutritionWeek } from "@/features/nutrition/services/nutrition-queries";
import { requireUser } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";
import { getTodayDate, resolveSchedule } from "@/utils/week";

export const metadata: Metadata = { title: "Dinh dưỡng" };

const NutritionPage = async ({ searchParams }: PageProps<"/nutrition">) => {
  const user = await requireUser();
  const params = await searchParams;
  const today = getTodayDate(TIME_ZONE);
  const { weekStart, selectedDate } = resolveSchedule(
    { week: readSearchParam(params.week), day: readSearchParam(params.day) },
    today,
  );
  const days = await getNutritionWeek(user.id, weekStart);

  return (
    <>
      <RememberUser name={user.name} />
      <AppHeader
        eyebrow="Xin chào"
        title={user.name}
        actions={<LogoutButton role="user" />}
      />
      <main
        className={`${PAGE_CONTAINER} pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <NutritionWeek
          basePath={ROUTES.NUTRITION}
          days={days}
          weekStart={weekStart}
          selectedDate={selectedDate}
          today={today}
          isEditable
        />
      </main>
    </>
  );
};

export default NutritionPage;
