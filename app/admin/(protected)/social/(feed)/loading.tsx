import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { InlineSkeleton } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { HeaderActionsSkeleton } from "@/components/layout/HeaderActionsSkeleton";
import { ROUTES } from "@/constants/routes";
import { PostCardSkeleton } from "@/features/social/components/PostCardSkeleton";
import { PostComposer } from "@/features/social/components/PostComposer";

export default async function Loading() {
  const t = await getTranslations("social.adminPages");

  return (
    <PageSkeleton
      hasTabBar={false}
      header={
        <AppHeader
          // The admin name is data; so are the chats link (super admin only)
          // and the bell's unread count.
          eyebrow={<InlineSkeleton className="h-3 w-28" />}
          title={t("socialTitle")}
          backHref={ROUTES.ADMIN}
          actions={<HeaderActionsSkeleton />}
        />
      }
    >
      {/* Admin posts always default to everyone, so the composer is static. */}
      <PostComposer mode="admin" defaultPrivacy="everyone" />
      <PostCardSkeleton hasImage />
      <PostCardSkeleton />
    </PageSkeleton>
  );
}
