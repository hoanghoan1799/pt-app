import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Skeleton, SkeletonCard } from "@/components/common/Skeleton";
import { PAGE_CONTAINER } from "@/constants/styles";

interface PageSkeletonProps {
  // Screen-specific placeholder; defaults to a few generic cards.
  children?: ReactNode;
  // false: children draw the whole screen (header included), e.g. chat.
  hasHeader?: boolean;
}

// Instant placeholder for route-level loading.tsx. Owns the accessible
// wrapper (role=status, aria-busy, sr-only label) for every screen skeleton.
export const PageSkeleton = async ({
  children,
  hasHeader = true,
}: PageSkeletonProps) => {
  const t = await getTranslations("common");

  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      {hasHeader ? (
        <>
          <div className="border-b border-line" aria-hidden>
            <div className={`${PAGE_CONTAINER} flex min-h-14 items-center`}>
              <Skeleton className="h-6 w-40" />
            </div>
          </div>
          <div
            className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
            aria-hidden
          >
            {children ?? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            )}
          </div>
        </>
      ) : (
        children
      )}
    </div>
  );
};
