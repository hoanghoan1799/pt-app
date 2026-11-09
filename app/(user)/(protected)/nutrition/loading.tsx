import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonCard } from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <WeekStripSkeleton />
      <Skeleton className="h-28 w-full" />
      <SkeletonCard />
      <SkeletonCard />
    </PageSkeleton>
  );
}
