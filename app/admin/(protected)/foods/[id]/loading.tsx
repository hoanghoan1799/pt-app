import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonCard } from "@/components/common/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton hasTabBar={false}>
      <SkeletonCard />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </PageSkeleton>
  );
}
