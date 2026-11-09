import { Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { BUTTON_PRIMARY } from "@/constants/styles";
import { FoodListSkeleton } from "@/features/foods/components/FoodListSkeleton";

export default async function Loading() {
  const t = await getTranslations("pages.adminFoods");

  return (
    <PageSkeleton
      hasTabBar={false}
      header={
        <AppHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          backHref={ROUTES.ADMIN}
        />
      }
    >
      <Link
        href={ROUTES.ADMIN_FOODS_NEW}
        className={`${BUTTON_PRIMARY} w-full`}
      >
        <Plus className="size-5" aria-hidden />
        {t("addFood")}
      </Link>
      <FoodListSkeleton />
    </PageSkeleton>
  );
}
