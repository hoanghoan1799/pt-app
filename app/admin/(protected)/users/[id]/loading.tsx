import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SkeletonCard } from "@/components/common/Skeleton";
import { WeekStripSkeleton } from "@/components/common/WeekStripSkeleton";
import { MemberSectionTabsSkeleton } from "@/components/layout/MemberSectionTabsSkeleton";

export default function Loading() {
  return (
    <PageSkeleton hasTabBar={false}>
      <MemberSectionTabsSkeleton />
      <WeekStripSkeleton />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </PageSkeleton>
  );
}
