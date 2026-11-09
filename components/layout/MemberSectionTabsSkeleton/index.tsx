import { Skeleton } from "@/components/common/Skeleton";
import { PAGE_CONTAINER } from "@/constants/styles";

// Four-segment strip, like MemberSectionTabs. The tab links need the member id
// from the route params, which loading.tsx does not receive, so it stays a
// placeholder.
export const MemberSectionTabsSkeleton = () => (
  <div className={`${PAGE_CONTAINER} pt-3`} aria-hidden>
    <Skeleton className="h-[3.25rem] w-full rounded-2xl" />
  </div>
);
