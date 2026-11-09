import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonList } from "@/components/common/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton hasTabBar={false}>
      <Skeleton className="h-4 w-32" />
      <SkeletonList rows={3} />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </PageSkeleton>
  );
}
