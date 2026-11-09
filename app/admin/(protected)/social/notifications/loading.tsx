import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SkeletonList } from "@/components/common/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton hasTabBar={false}>
      <SkeletonList rows={6} />
    </PageSkeleton>
  );
}
