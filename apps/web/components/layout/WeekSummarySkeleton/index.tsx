import { useTranslations } from "next-intl";

import { Skeleton, SkeletonCard } from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";
import { SECTION_TITLE } from "@/constants/styles";

interface WeekSummarySkeletonProps {
  // Admin view only: the "Tiến bộ" section between weight and workouts.
  hasProgress?: boolean;
}

// Mirrors WeekSummary: the section titles are static and render for real;
// the week header and the cards are data.
export const WeekSummarySkeleton = ({
  hasProgress = false,
}: WeekSummarySkeletonProps) => {
  const t = useTranslations("layout.weekSummary");

  return (
    <div className="space-y-6">
      <WeekStripSkeleton variant="navigator" />
      <section className="space-y-2">
        <h2 className={SECTION_TITLE}>{t("weight")}</h2>
        <Skeleton className="h-48 w-full" />
      </section>
      {hasProgress && (
        <section className="space-y-2">
          <h2 className={SECTION_TITLE}>{t("progress")}</h2>
          <SkeletonCard />
        </section>
      )}
      <section className="space-y-2">
        <h2 className={SECTION_TITLE}>{t("workouts")}</h2>
        <SkeletonCard />
      </section>
      <section className="space-y-2">
        <h2 className={SECTION_TITLE}>{t("nutrition")}</h2>
        <SkeletonCard />
      </section>
    </div>
  );
};
