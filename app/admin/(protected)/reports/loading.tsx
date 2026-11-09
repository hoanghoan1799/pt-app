import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonCard } from "@/components/common/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton hasTabBar={false}>
      <Skeleton className="h-4 w-32" />
      <SkeletonCard />
      <SkeletonCard />
    </PageSkeleton>
  );
}
