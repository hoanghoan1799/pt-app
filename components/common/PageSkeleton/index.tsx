import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { SkeletonCard } from "@/components/common/Skeleton";
import { PAGE_CONTAINER } from "@/constants/styles";

interface PageSkeletonProps {
  // The real page chrome (AppHeader, tabs); rendered as is, never as a skeleton.
  header?: ReactNode;
  // Screen content: static UI for real, data-driven parts as placeholders.
  // Defaults to a few generic cards.
  children?: ReactNode;
  // false: no bottom tab bar to clear (admin screens), so less bottom padding.
  hasTabBar?: boolean;
}

// Instant placeholder for route-level loading.tsx. Only data-driven parts
// are placeholders; the header and other static UI render for real. Owns
// the accessible status (role=status, aria-busy, sr-only label).
export const PageSkeleton = async ({
  header,
  children,
  hasTabBar = true,
}: PageSkeletonProps) => {
  const t = await getTranslations("common");

  return (
    <>
      {header}
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 ${
          hasTabBar
            ? "pb-[calc(env(safe-area-inset-bottom)+6rem)]"
            : "pb-[calc(env(safe-area-inset-bottom)+2rem)]"
        }`}
        aria-busy="true"
      >
        <div role="status" className="sr-only">
          {t("loading")}
        </div>
        {children ?? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
      </main>
    </>
  );
};
