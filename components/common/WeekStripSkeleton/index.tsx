import { useTranslations } from "next-intl";

import { InlineSkeleton, Skeleton } from "@/components/common/Skeleton";
import { CARD } from "@/constants/styles";

interface WeekStripSkeletonProps {
  // "calendar": week header, seven day cells and the status legend (workout
  // and nutrition tabs). "navigator": only the week header card.
  variant?: "calendar" | "navigator";
  // Thin completion bar under the calendar (workout tabs).
  hasProgress?: boolean;
}

// Widths of the two legend text placeholders.
const LEGEND_BAR_WIDTHS = ["w-20", "w-24"] as const;

// The selected week comes from the URL, which loading.tsx cannot read, so the
// week title, arrows and day cells stay placeholders. The legend is a neutral
// placeholder too: while loading, nothing renders in status colours.
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
          <div className="flex gap-x-4" aria-hidden>
            {LEGEND_BAR_WIDTHS.map((width) => (
              <div key={width} className="flex items-center gap-2">
                <Skeleton className="size-2 rounded-full" />
                <InlineSkeleton className={`h-3 ${width}`} />
              </div>
            ))}
          </div>
        </div>
      </section>
      {hasProgress && <Skeleton className="h-2 w-full rounded-full" />}
    </div>
  );
};
