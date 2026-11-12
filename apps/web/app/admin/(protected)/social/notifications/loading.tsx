import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SkeletonList } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";

export default async function Loading() {
  const t = await getTranslations("social.adminPages");

  return (
    <PageSkeleton
      hasTabBar={false}
      header={
        <AppHeader
          eyebrow={t("eyebrow")}
          title={t("notificationsTitle")}
          backHref={ROUTES.ADMIN_SOCIAL}
        />
      }
    >
      <SkeletonList rows={6} />
    </PageSkeleton>
  );
}
