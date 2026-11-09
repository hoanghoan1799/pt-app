import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonList } from "@/components/common/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton hasTabBar={false}>
      <Skeleton className="h-12 w-full" />
      <SkeletonList rows={6} />
    </PageSkeleton>
  );
}
