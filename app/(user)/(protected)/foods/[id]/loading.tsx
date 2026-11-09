import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton, SkeletonCard } from "@/components/common/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="aspect-video w-full" />
      <SkeletonCard />
      <SkeletonCard />
    </PageSkeleton>
  );
}
