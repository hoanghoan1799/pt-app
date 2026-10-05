import { CheckCircle2, History } from "lucide-react";
import Link from "next/link";

import { CARD } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import type { ActivityItem } from "@/features/dashboard/types/dashboard";
import { getAdminUserPath } from "@/utils/routes";
import { formatClockTime, formatRelativeTime } from "@/utils/time";
import { formatFullDay } from "@/utils/week";

interface RecentActivityListProps {
  items: ActivityItem[];
  // Hidden on a single user's page, where every item is theirs.
  isUserShown: boolean;
  now: number;
}

export const RecentActivityList = ({
  items,
  isUserShown,
  now,
}: RecentActivityListProps) => {
  if (!items.length) {
    return (
      <div
        className={`${CARD} flex items-center gap-3 px-4 py-5 text-sm text-muted`}
      >
        <History className="size-5 shrink-0" aria-hidden />
        Chưa có ai đánh dấu đã tập bài nào.
      </div>
    );
  }

  return (
    <ol className={`${CARD} divide-y divide-line overflow-hidden`}>
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 px-4 py-3">
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0 text-success"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug text-fg">
              {isUserShown && (
                <>
                  <Link
                    href={getAdminUserPath(item.userId)}
                    className="font-semibold underline-offset-2 active:underline"
                  >
                    {item.userName}
                  </Link>{" "}
                  đã tập{" "}
                </>
              )}
              <span className="font-medium">{item.exerciseTitle}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Lịch {formatFullDay(item.date)} · lúc{" "}
              {formatClockTime(item.completedAt, TIME_ZONE)}
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted">
            {formatRelativeTime(item.completedAt, TIME_ZONE, now)}
          </span>
        </li>
      ))}
    </ol>
  );
};
