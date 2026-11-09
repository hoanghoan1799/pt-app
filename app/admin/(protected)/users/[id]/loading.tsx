import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { InlineSkeleton, SkeletonCard } from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { HeaderActionsSkeleton } from "@/components/layout/HeaderActionsSkeleton";
import { MemberSectionTabsSkeleton } from "@/components/layout/MemberSectionTabsSkeleton";
import { ROUTES } from "@/constants/routes";

export default async function Loading() {
  const t = await getTranslations("adminPages.userPage");

  return (
    <PageSkeleton
      hasTabBar={false}
      header={
        <>
          <AppHeader
            eyebrow={t("eyebrow")}
            // The member name is data; the preview link needs the member id.
            title={<InlineSkeleton className="h-6 w-40" />}
            // The real link keeps the selected week, which is not known here.
            backHref={ROUTES.ADMIN}
            actions={<HeaderActionsSkeleton count={1} />}
          />
          <MemberSectionTabsSkeleton />
        </>
      }
    >
      <WeekStripSkeleton hasProgress />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </PageSkeleton>
  );
}
