import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Skeleton } from "@/components/common/Skeleton";

// Read-only bubble list inside the normal page container.
const BUBBLES = ["w-2/3", "w-1/2", "w-3/5", "w-2/5", "w-3/4"] as const;

export default function Loading() {
  return (
    <PageSkeleton hasTabBar={false}>
      {BUBBLES.map((width, index) => (
        <div
          key={index}
          className={`flex ${index % 2 === 0 ? "justify-start" : "justify-end"}`}
        >
          <Skeleton className={`h-10 rounded-2xl ${width}`} />
        </div>
      ))}
    </PageSkeleton>
  );
}
