import { Eye } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { InlineSkeleton, SkeletonCard } from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";
import { AppHeader } from "@/components/layout/AppHeader";

export default async function Loading() {
  const t = await getTranslations("adminPages.userPreview");

  return (
    <PageSkeleton
      hasTabBar={false}
      header={
        <AppHeader
          eyebrow={t("eyebrow")}
          // The member name is data; the back link points at the member id.
          title={<InlineSkeleton className="h-6 w-40" />}
          isBackLoading
        />
      }
    >
      <p className="flex items-center gap-2 rounded-xl bg-accent/12 px-3 py-2.5 text-sm font-medium text-accent">
        <Eye className="size-4 shrink-0" aria-hidden />
        {t("notice")}
      </p>
      <WeekStripSkeleton hasProgress />
      <SkeletonCard />
      <SkeletonCard />
    </PageSkeleton>
  );
}
