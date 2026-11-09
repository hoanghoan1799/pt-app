import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import {
  InlineSkeleton,
  Skeleton,
  SkeletonCard,
} from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { MemberSectionTabsSkeleton } from "@/components/layout/MemberSectionTabsSkeleton";
import { ROUTES } from "@/constants/routes";

export default async function Loading() {
  const t = await getTranslations("adminPages.userNutrition");

  return (
    <PageSkeleton
      hasTabBar={false}
      header={
        <>
          <AppHeader
            eyebrow={t("eyebrow")}
            // The member name is data.
            title={<InlineSkeleton className="h-6 w-40" />}
            // The real link keeps the selected week, which is not known here.
            backHref={ROUTES.ADMIN}
          />
          <MemberSectionTabsSkeleton />
        </>
      }
    >
      <SkeletonCard />
      <Skeleton className="h-28 w-full" />
      <WeekStripSkeleton />
      <SkeletonCard />
    </PageSkeleton>
  );
}
