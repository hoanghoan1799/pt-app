import { Skeleton } from "@/components/common/Skeleton";
import { PAGE_CONTAINER } from "@/constants/styles";

// Alternating peer (left) and own (right) bubble widths.
const BUBBLES = ["w-2/3", "w-1/2", "w-3/5", "w-2/5", "w-3/4", "w-1/2"] as const;

// Full-screen thread placeholder: header, bubbles, composer bar.
export const ChatThreadSkeleton = () => (
  <div className="fixed inset-x-0 top-0 z-20 flex h-dvh flex-col bg-bg">
    <div className="border-b border-line pt-[env(safe-area-inset-top)]">
      <div className={`${PAGE_CONTAINER} flex min-h-14 items-center gap-3`}>
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <Skeleton className="h-5 w-32" />
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-hidden px-4">
      <div className="mx-auto w-full max-w-lg space-y-3 pt-4">
        {BUBBLES.map((width, index) => (
          <div
            key={index}
            className={`flex ${index % 2 === 0 ? "justify-start" : "justify-end"}`}
          >
            <Skeleton className={`h-10 rounded-2xl ${width}`} />
          </div>
        ))}
      </div>
    </div>
    <div className="pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      <div className={`${PAGE_CONTAINER} pt-2`}>
        <Skeleton className="h-12 w-full rounded-[1.5rem]" />
      </div>
    </div>
  </div>
);
