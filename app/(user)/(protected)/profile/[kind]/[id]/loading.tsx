import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { InlineSkeleton, Skeleton } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PostCardSkeleton } from "@/features/social/components/PostCardSkeleton";

export default async function Loading() {
  const t = await getTranslations("pages.profile");

  return (
    <PageSkeleton
      header={
        <AppHeader
          eyebrow={t("eyebrow")}
          // The profile name is data.
          title={<InlineSkeleton className="h-6 w-40" />}
          backHref={ROUTES.FEED}
        />
      }
    >
      <div className="flex items-center gap-4">
        <Skeleton className="size-[88px] shrink-0 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <PostCardSkeleton />
    </PageSkeleton>
  );
}
