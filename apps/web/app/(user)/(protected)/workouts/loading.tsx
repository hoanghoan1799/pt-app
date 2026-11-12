import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { InlineSkeleton, SkeletonCard } from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { HeaderActionsSkeleton } from "@/components/layout/HeaderActionsSkeleton";

export default async function Loading() {
  const t = await getTranslations("pages.workouts");

  return (
    <PageSkeleton
      header={
        <AppHeader
          eyebrow={t("eyebrow")}
          // The member name and the account menus are data.
          title={<InlineSkeleton className="h-6 w-40" />}
          actions={<HeaderActionsSkeleton />}
        />
      }
    >
      <WeekStripSkeleton hasProgress />
      <SkeletonCard />
      <SkeletonCard />
    </PageSkeleton>
  );
}
