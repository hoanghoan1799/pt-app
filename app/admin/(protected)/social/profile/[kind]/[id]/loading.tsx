import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { InlineSkeleton, Skeleton } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PostCardSkeleton } from "@/features/social/components/PostCardSkeleton";

export default async function Loading() {
  const t = await getTranslations("social.adminPages");

  return (
    <PageSkeleton
      hasTabBar={false}
      header={
        <AppHeader
          eyebrow={t("eyebrow")}
          // The profile name is data.
          title={<InlineSkeleton className="h-6 w-40" />}
          backHref={ROUTES.ADMIN_SOCIAL}
        />
      }
    >
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="size-24 rounded-full" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <PostCardSkeleton />
    </PageSkeleton>
  );
}
