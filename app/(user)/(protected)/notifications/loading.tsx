import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SkeletonList } from "@/components/common/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonList rows={6} />
    </PageSkeleton>
  );
}
