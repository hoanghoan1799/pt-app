import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonCard } from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";

export default function Loading() {
  return (
    <PageSkeleton hasTabBar={false}>
      <Skeleton className="h-10 w-full" />
      <WeekStripSkeleton />
      <SkeletonCard />
      <SkeletonCard />
    </PageSkeleton>
  );
}
