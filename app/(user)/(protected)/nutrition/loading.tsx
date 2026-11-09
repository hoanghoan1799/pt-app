import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import {
  InlineSkeleton,
  Skeleton,
  SkeletonCard,
} from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { HeaderActionsSkeleton } from "@/components/layout/HeaderActionsSkeleton";

export default async function Loading() {
  const t = await getTranslations("pages.nutrition");

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
      <WeekStripSkeleton />
      <Skeleton className="h-28 w-full" />
      <SkeletonCard />
      <SkeletonCard />
    </PageSkeleton>
  );
}
