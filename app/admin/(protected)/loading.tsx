import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import {
  InlineSkeleton,
  Skeleton,
  SkeletonList,
} from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { HeaderActionsSkeleton } from "@/components/layout/HeaderActionsSkeleton";
import { ROUTES } from "@/constants/routes";
import { ICON_BUTTON, SECTION_TITLE } from "@/constants/styles";

// Dashboard. Real: title, messages link, section titles. Placeholders: the
// admin name, account menus, tiles (they depend on the role), week and lists.
// Also the fallback for admin pages without their own loading.tsx.
export default async function Loading() {
  const t = await getTranslations("adminPages.home");

  return (
    <PageSkeleton
      hasTabBar={false}
      header={
        <AppHeader
          eyebrow={<InlineSkeleton className="h-3 w-28" />}
          title={t("title")}
          actions={
            <>
              <Link
                href={ROUTES.ADMIN_MESSAGES}
                className={`${ICON_BUTTON} text-fg`}
                aria-label={t("tiles.messages")}
              >
                <MessageCircle className="size-5" />
              </Link>
              <HeaderActionsSkeleton />
            </>
          }
        />
      }
    >
      <section className="space-y-2" aria-labelledby="admin-actions-title">
        <h2 id="admin-actions-title" className={SECTION_TITLE}>
          {t("actions")}
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      </section>
      <div className="space-y-3">
        <WeekStripSkeleton variant="navigator" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </div>
      <section className="space-y-2">
        {/* The title carries the member count. */}
        <Skeleton className="h-4 w-24" />
        <SkeletonList rows={4} />
      </section>
      <section className="space-y-2">
        <h2 className={SECTION_TITLE}>{t("recentActivity")}</h2>
        <SkeletonList rows={3} />
      </section>
    </PageSkeleton>
  );
}
