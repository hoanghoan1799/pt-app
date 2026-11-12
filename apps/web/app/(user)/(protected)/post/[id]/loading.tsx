import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SkeletonList } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PostCardSkeleton } from "@/features/social/components/PostCardSkeleton";

export default async function Loading() {
  const t = await getTranslations("social.pages");

  return (
    <PageSkeleton
      header={
        <AppHeader
          eyebrow={t("feedTitle")}
          title={t("postTitle")}
          backHref={ROUTES.FEED}
        />
      }
    >
      <PostCardSkeleton hasImage />
      <SkeletonList rows={3} />
    </PageSkeleton>
  );
}
