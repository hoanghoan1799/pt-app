import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import {
  InlineSkeleton,
  Skeleton,
  SkeletonCard,
} from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { SECTION_TITLE } from "@/constants/styles";

export default async function Loading() {
  const t = await getTranslations("pages.adminFoodDetail");

  return (
    <PageSkeleton
      hasTabBar={false}
      header={
        <AppHeader
          eyebrow={t("eyebrow")}
          // The food name is data.
          title={<InlineSkeleton className="h-6 w-40" />}
          backHref={ROUTES.ADMIN_FOODS}
        />
      }
    >
      <SkeletonCard />
      <section className="space-y-3">
        <h2 className={SECTION_TITLE}>{t("edit")}</h2>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </section>
    </PageSkeleton>
  );
}
