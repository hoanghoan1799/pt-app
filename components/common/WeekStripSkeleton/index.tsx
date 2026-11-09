import { Skeleton } from "@/components/common/Skeleton";

// Seven day pills plus a thin progress bar, like the week calendar strip.
export const WeekStripSkeleton = () => (
  <div className="space-y-3" aria-hidden>
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 7 }, (_, index) => (
        <Skeleton key={index} className="h-16" />
      ))}
    </div>
    <Skeleton className="h-2 w-full rounded-full" />
  </div>
);
