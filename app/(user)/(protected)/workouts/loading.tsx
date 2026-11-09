import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SkeletonCard } from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <WeekStripSkeleton />
      <SkeletonCard />
      <SkeletonCard />
    </PageSkeleton>
  );
}
