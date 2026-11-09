import { CARD } from "@/constants/styles";

interface SkeletonProps {
  className?: string;
}

// Pulsing placeholder block; stays still for reduced-motion users.
export const Skeleton = ({ className = "" }: SkeletonProps) => (
  <div
    className={`animate-pulse rounded-xl bg-line/60 motion-reduce:animate-none ${className}`}
    aria-hidden
  />
);

// Inline-safe placeholder for text slots (headings, labels); a span so it can
// sit inside h1 or p without invalid nesting.
export const InlineSkeleton = ({ className = "" }: SkeletonProps) => (
  <span
    className={`block animate-pulse rounded-md bg-line/60 motion-reduce:animate-none ${className}`}
    aria-hidden
  />
);

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export const SkeletonText = ({
  lines = 3,
  className = "",
}: SkeletonTextProps) => (
  <div className={`space-y-2 ${className}`} aria-hidden>
    {Array.from({ length: lines }, (_, index) => (
      <Skeleton
        key={index}
        className={`h-4 ${index === lines - 1 && lines > 1 ? "w-2/3" : "w-full"}`}
      />
    ))}
  </div>
);

export const SkeletonCard = ({ className = "" }: SkeletonProps) => (
  <div className={`${CARD} p-4 ${className}`} aria-hidden>
    <Skeleton className="mb-3 h-5 w-1/3" />
    <SkeletonText lines={3} />
  </div>
);

interface SkeletonListProps {
  rows?: number;
  className?: string;
}

export const SkeletonList = ({
  rows = 4,
  className = "",
}: SkeletonListProps) => (
  <div className={`space-y-3 ${className}`} aria-hidden>
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="flex items-center gap-3">
        <Skeleton className="size-11 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    ))}
  </div>
);
