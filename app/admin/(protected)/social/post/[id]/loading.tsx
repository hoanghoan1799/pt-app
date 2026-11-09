import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SkeletonList } from "@/components/common/Skeleton";
import { PostCardSkeleton } from "@/features/social/components/PostCardSkeleton";

export default function Loading() {
  return (
    <PageSkeleton hasTabBar={false}>
      <PostCardSkeleton hasImage />
      <SkeletonList rows={3} />
    </PageSkeleton>
  );
}
