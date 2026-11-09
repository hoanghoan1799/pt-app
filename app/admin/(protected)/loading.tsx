import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonList } from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";

// Dashboard: action tiles, week strip, summary tiles, member list.
export default function Loading() {
  return (
    <PageSkeleton hasTabBar={false}>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
      <WeekStripSkeleton />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <SkeletonList rows={5} />
    </PageSkeleton>
  );
}
