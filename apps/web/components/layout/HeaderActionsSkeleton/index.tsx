import { Skeleton } from "@/components/common/Skeleton";
import { ICON_BUTTON } from "@/constants/styles";

interface HeaderActionsSkeletonProps {
  // Round icon buttons to draw, e.g. 2 for the gear and avatar menus.
  count?: number;
}

// Stand-in for header actions that need the signed-in person's data.
export const HeaderActionsSkeleton = ({
  count = 2,
}: HeaderActionsSkeletonProps) => (
  <div className="flex items-center" aria-hidden>
    {Array.from({ length: count }, (_, index) => (
      <div key={index} className={ICON_BUTTON}>
        <Skeleton className="size-8 rounded-full" />
      </div>
    ))}
  </div>
);
