import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SkeletonList } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";

export default async function Loading() {
  const t = await getTranslations("chatGroups.pages");

  return (
    <PageSkeleton
      hasTabBar={false}
      header={
        <AppHeader title={t("createTitle")} backHref={ROUTES.ADMIN_MESSAGES} />
      }
    >
      <SkeletonList rows={6} />
    </PageSkeleton>
  );
}
