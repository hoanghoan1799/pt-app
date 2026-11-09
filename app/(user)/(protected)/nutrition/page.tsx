import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { UserHeaderActions } from "@/features/auth/components/UserHeaderActions";
import { FoodLibraryLink } from "@/features/foods/components/FoodLibraryLink";
import { MealPreferencesForm } from "@/features/meal-plans/components/MealPreferencesForm";
import { TraineeMealPlan } from "@/features/meal-plans/components/TraineeMealPlan";
import {
  getMealLogData,
  getWeekCompletion,
} from "@/features/meal-plans/services/meal-log-queries";
import {
  getMealPlanWeek,
  listPlanFoods,
} from "@/features/meal-plans/services/meal-plan-queries";
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
  const [days, planDays, library, completion] = await Promise.all([
    getNutritionWeek(user.id, weekStart),
    getMealPlanWeek(user.id, weekStart),
    listPlanFoods(),
    getWeekCompletion(user.id, weekStart),
  ]);
  const selectedPlan =
    planDays.find((day) => day.date === selectedDate) ?? null;
  const { logs, marks } = await getMealLogData(
    selectedPlan?.meals.map((meal) => meal.id) ?? [],
  );

  return (
    <>
      <AppHeader
        eyebrow="Xin chào"
        title={user.name}
        actions={<UserHeaderActions />}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <NutritionWeek
          basePath={ROUTES.NUTRITION}
          days={days}
          weekStart={weekStart}
          selectedDate={selectedDate}
          today={today}
          isEditable={false}
          isLegacyLog
          completion={completion}
        >
          <TraineeMealPlan
            // A fresh tree per day: sheets and half-typed notes reset.
            key={selectedDate}
            plan={selectedPlan}
            target={
              days.find((day) => day.date === selectedDate)?.target ?? null
            }
            logs={logs}
            marks={marks}
            library={library}
            isLoggable={selectedDate <= today}
          />
        </NutritionWeek>
        <MealPreferencesForm
          preferredMealCount={user.preferredMealCount}
          foodNote={user.foodNote}
        />
        <FoodLibraryLink />
      </main>
    </>
  );
};

export default NutritionPage;
