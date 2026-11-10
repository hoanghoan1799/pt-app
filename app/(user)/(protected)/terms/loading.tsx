import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SkeletonCard } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";

// Real header; the terms text and the accept state are placeholders.
export default async function Loading() {
  const t = await getTranslations("pages.terms");

  return (
    <PageSkeleton
      header={
        <AppHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          backHref={ROUTES.FEED}
        />
      }
    >
      <SkeletonCard />
      <SkeletonCard />
    </PageSkeleton>
  );
}
