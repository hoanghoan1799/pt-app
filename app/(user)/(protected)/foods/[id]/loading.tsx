import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import {
  InlineSkeleton,
  Skeleton,
  SkeletonCard,
} from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";

export default async function Loading() {
  const t = await getTranslations("pages.foodDetail");

  return (
    <PageSkeleton
      header={
        <AppHeader
          eyebrow={t("eyebrow")}
          // The food name is data.
          title={<InlineSkeleton className="h-6 w-40" />}
          backHref={ROUTES.FOODS}
        />
      }
    >
      <Skeleton className="aspect-video w-full" />
      <SkeletonCard />
      <SkeletonCard />
    </PageSkeleton>
  );
}
