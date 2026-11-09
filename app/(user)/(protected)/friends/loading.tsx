import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonList } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";

export default async function Loading() {
  const t = await getTranslations("social.pages");

  return (
    <PageSkeleton
      header={
        <AppHeader
          eyebrow={t("eyebrow")}
          title={t("friendsTitle")}
          backHref={ROUTES.FEED}
        />
      }
    >
      {/* The active tab comes from the URL and the badge from the DB. */}
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-4 w-24" />
      <SkeletonList rows={5} />
    </PageSkeleton>
  );
}
