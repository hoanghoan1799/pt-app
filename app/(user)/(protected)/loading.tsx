import { PageSkeleton } from "@/components/common/PageSkeleton";
import { InlineSkeleton } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";

// Fallback for pages without their own loading.tsx (account, terms): their
// title is not known here, so only the title text is a placeholder.
export default function Loading() {
  return (
    <PageSkeleton
      header={<AppHeader title={<InlineSkeleton className="h-6 w-40" />} />}
    />
  );
}
