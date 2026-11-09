import { CheckCircle2, History, Trophy } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { CARD } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import type { ActivityItem } from "@/features/dashboard/types/dashboard";
import { formatSet } from "@/features/workouts/utils/set-logger";
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
  const t = useTranslations("dashboard.recentActivity");

  if (!items.length) {
    return (
      <div
        className={`${CARD} flex items-center gap-3 px-4 py-5 text-sm text-muted`}
      >
        <History className="size-5 shrink-0" aria-hidden />
        {t("empty")}
      </div>
    );
  }

  return (
    <ol className={`${CARD} divide-y divide-line overflow-hidden`}>
      {items.map((item) => (
        <li
          key={`${item.kind}-${item.id}`}
          className="flex items-start gap-3 px-4 py-3"
        >
          {item.kind === "personalBest" ? (
            <Trophy
              className="mt-0.5 size-5 shrink-0 text-warning"
              aria-hidden
            />
          ) : (
            <CheckCircle2
              className="mt-0.5 size-5 shrink-0 text-success"
              aria-hidden
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug text-fg">
              {isUserShown && (
                <>
                  <Link
                    href={getAdminUserPath(item.userId)}
                    className="font-semibold underline-offset-2 active:underline"
                  >
                    {item.displayName ?? item.userName}
                  </Link>{" "}
                  {item.kind === "personalBest"
                    ? t("personalBest")
                    : t("completed")}{" "}
                </>
              )}
              <span className="font-medium">{item.exerciseTitle}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {item.kind === "personalBest" &&
                t("bestPrefix", {
                  best: formatSet(item.best),
                  previous: formatSet(item.previousBest),
                })}
              {t("schedule", {
                date: formatFullDay(item.date),
                time: formatClockTime(item.occurredAt, TIME_ZONE),
              })}
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted">
            {formatRelativeTime(item.occurredAt, TIME_ZONE, now)}
          </span>
        </li>
      ))}
    </ol>
  );
};
