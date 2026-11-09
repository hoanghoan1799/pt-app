import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/common/PageSkeleton";
import { InlineSkeleton, Skeleton } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";

// Read-only bubble list inside the normal page container.
const BUBBLES = ["w-2/3", "w-1/2", "w-3/5", "w-2/5", "w-3/4"] as const;

export default async function Loading() {
  const t = await getTranslations("social.adminPages");

  return (
    <PageSkeleton
      hasTabBar={false}
      header={
        <AppHeader
          eyebrow={t("readOnly")}
          // The title is the two member names.
          title={<InlineSkeleton className="h-6 w-48" />}
          backHref={ROUTES.ADMIN_SOCIAL_CHATS}
        />
      }
    >
      {BUBBLES.map((width, index) => (
        <div
          key={index}
          className={`flex ${index % 2 === 0 ? "justify-start" : "justify-end"}`}
        >
          <Skeleton className={`h-10 rounded-2xl ${width}`} />
        </div>
      ))}
    </PageSkeleton>
  );
}
