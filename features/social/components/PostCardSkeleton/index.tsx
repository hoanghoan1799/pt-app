import { Skeleton, SkeletonText } from "@/components/common/Skeleton";
import { CARD } from "@/constants/styles";

interface PostCardSkeletonProps {
  hasImage?: boolean;
}

// Placeholder shaped like PostCard: author row, text, optional image.
export const PostCardSkeleton = ({
  hasImage = false,
}: PostCardSkeletonProps) => (
  <div className={`${CARD} space-y-3 p-4`} aria-hidden>
    <div className="flex items-center gap-3">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
    <SkeletonText lines={2} />
    {hasImage && <Skeleton className="aspect-[4/3] w-full" />}
    <Skeleton className="h-8 w-1/2" />
  </div>
);
