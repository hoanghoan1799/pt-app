import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonCard } from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <WeekStripSkeleton />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-48 w-full" />
      <SkeletonCard />
    </PageSkeleton>
  );
}
