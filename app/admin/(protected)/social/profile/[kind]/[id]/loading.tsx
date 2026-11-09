import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton } from "@/components/common/Skeleton";
import { PostCardSkeleton } from "@/features/social/components/PostCardSkeleton";

export default function Loading() {
  return (
    <PageSkeleton hasTabBar={false}>
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="size-24 rounded-full" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <PostCardSkeleton />
    </PageSkeleton>
  );
}
