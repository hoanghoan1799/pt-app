import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { FoodListSkeleton } from "@/features/foods/components/FoodListSkeleton";

export default async function Loading() {
  const t = await getTranslations("pages.foods");

  return (
    <PageSkeleton
      header={
        <AppHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          backHref={ROUTES.NUTRITION}
        />
      }
    >
      <FoodListSkeleton />
    </PageSkeleton>
  );
}
