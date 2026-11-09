import { useTranslations } from "next-intl";

import { DayStatusLegend } from "@/components/common/DayStatusLegend";
import { Skeleton } from "@/components/common/Skeleton";
import { CARD } from "@/constants/styles";

interface WeekStripSkeletonProps {
  // "calendar": week header, seven day cells and the status legend (workout
  // and nutrition tabs). "navigator": only the week header card.
  variant?: "calendar" | "navigator";
  // Thin completion bar under the calendar (workout tabs).
  hasProgress?: boolean;
}

// The selected week comes from the URL, which loading.tsx cannot read, so the
// week title, arrows and day cells stay placeholders. The legend is static
// and renders for real.
export const WeekStripSkeleton = ({
  variant = "calendar",
  hasProgress = false,
}: WeekStripSkeletonProps) => {
  const t = useTranslations("common.week");

  if (variant === "navigator") {
    return (
      <div className={`${CARD} p-4`} aria-hidden>
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section aria-label={t("calendar")} className={`${CARD} space-y-4 p-4`}>
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-7 gap-1.5" aria-hidden>
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
        <div className="border-t border-line pt-3">
          <DayStatusLegend />
        </div>
      </section>
      {hasProgress && <Skeleton className="h-2 w-full rounded-full" />}
    </div>
  );
};
