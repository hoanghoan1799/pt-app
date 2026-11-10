import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { InlineSkeleton, SkeletonCard } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";

// Real title and back link; the account email and the form are placeholders.
export default async function Loading() {
  const t = await getTranslations("pages.changePassword");

  return (
    <PageSkeleton
      header={
        <AppHeader
          eyebrow={<InlineSkeleton className="h-3 w-32" />}
          title={t("title")}
          backHref={ROUTES.WORKOUTS}
        />
      }
    >
      <SkeletonCard />
    </PageSkeleton>
  );
}
