import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonList } from "@/components/common/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-4 w-24" />
      <SkeletonList rows={5} />
    </PageSkeleton>
  );
}
