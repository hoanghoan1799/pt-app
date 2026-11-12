import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonList } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { SECTION_TITLE } from "@/constants/styles";

export default async function Loading() {
  const t = await getTranslations("adminPages.pts");

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
      <section className="space-y-2">
        {/* The title carries the account count. */}
        <Skeleton className="h-4 w-32" />
        <SkeletonList rows={3} />
      </section>
      <section className="space-y-2">
        <h2 className={SECTION_TITLE}>{t("traineesByPt")}</h2>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </section>
    </PageSkeleton>
  );
}
