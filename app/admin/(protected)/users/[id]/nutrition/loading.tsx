import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonCard } from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";
import { MemberSectionTabsSkeleton } from "@/components/layout/MemberSectionTabsSkeleton";

export default function Loading() {
  return (
    <PageSkeleton hasTabBar={false}>
      <MemberSectionTabsSkeleton />
      <SkeletonCard />
      <Skeleton className="h-28 w-full" />
      <WeekStripSkeleton />
      <SkeletonCard />
    </PageSkeleton>
  );
}
