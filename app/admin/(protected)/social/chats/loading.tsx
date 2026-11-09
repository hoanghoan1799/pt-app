import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonList } from "@/components/common/Skeleton";
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
          title={t("chatsTitle")}
          backHref={ROUTES.ADMIN_SOCIAL}
        />
      }
    >
      {/* The title carries the chat count. */}
      <Skeleton className="h-4 w-32" />
      <SkeletonList rows={6} />
    </PageSkeleton>
  );
}
