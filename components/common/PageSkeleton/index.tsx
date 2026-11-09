import { getTranslations } from "next-intl/server";

import { Skeleton, SkeletonCard } from "@/components/common/Skeleton";
import { PAGE_CONTAINER } from "@/constants/styles";

// Instant placeholder for route-level loading.tsx.
export const PageSkeleton = async () => {
  const t = await getTranslations("common");

  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      <div className={`${PAGE_CONTAINER} space-y-4 pt-3 pb-12`} aria-hidden>
        <Skeleton className="h-14 w-full" />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
};
