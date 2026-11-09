import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton } from "@/components/common/Skeleton";
import { PostCardSkeleton } from "@/features/social/components/PostCardSkeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-24 w-full" />
      <PostCardSkeleton hasImage />
      <PostCardSkeleton />
    </PageSkeleton>
  );
}
