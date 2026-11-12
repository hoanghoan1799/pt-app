import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { HeaderActionsSkeleton } from "@/components/layout/HeaderActionsSkeleton";
import { PostCardSkeleton } from "@/features/social/components/PostCardSkeleton";

export default async function Loading() {
  const t = await getTranslations("social.pages");

  return (
    <PageSkeleton
      header={
        <AppHeader
          eyebrow={t("eyebrow")}
          title={t("feedTitle")}
          // Bell, friends link and the account menus all need user data.
          actions={<HeaderActionsSkeleton count={4} />}
        />
      }
    >
      <Skeleton className="h-24 w-full" />
      <PostCardSkeleton hasImage />
      <PostCardSkeleton />
    </PageSkeleton>
  );
}
