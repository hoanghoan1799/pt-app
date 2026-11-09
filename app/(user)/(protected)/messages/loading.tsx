import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonList } from "@/components/common/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonList rows={1} />
      <Skeleton className="h-4 w-24" />
      <SkeletonList rows={4} />
    </PageSkeleton>
  );
}
