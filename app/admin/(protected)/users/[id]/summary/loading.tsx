import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { InlineSkeleton } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { MemberSectionTabsSkeleton } from "@/components/layout/MemberSectionTabsSkeleton";
import { WeekSummarySkeleton } from "@/components/layout/WeekSummarySkeleton";
import { ROUTES } from "@/constants/routes";

export default async function Loading() {
  const t = await getTranslations("adminPages.userSummary");

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
      <WeekSummarySkeleton hasProgress />
    </PageSkeleton>
  );
}
