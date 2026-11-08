import clsx from "clsx";
import Link from "next/link";

import { Avatar } from "@/components/common/Avatar";
import { CARD } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import type { NotificationView } from "@/features/social/types/social";
import { formatRelativeTime } from "@/utils/time";

interface NotificationListProps {
  notifications: NotificationView[];
}

const ROW = "flex items-center gap-3 p-3";

// "Thông báo": newest first; unread rows are tinted. A row with a post links
// to it.
export const NotificationList = ({ notifications }: NotificationListProps) => {
  if (notifications.length === 0) {
    return (
      <p className={`${CARD} p-6 text-center text-muted`}>
        Chưa có thông báo nào.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {notifications.map((item) => {
        const content = (
          <>
            <Avatar
              name={item.actorName}
              src={item.actorAvatarUrl}
              className="size-10 shrink-0 text-sm"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-base break-words text-fg">
                {item.text}
              </span>
              <span className="block text-xs text-muted">
                {formatRelativeTime(item.createdAt, TIME_ZONE)}
              </span>
            </span>
            {item.isUnread && (
              <span
                className="size-2.5 shrink-0 rounded-full bg-accent"
                role="img"
                aria-label="Chưa đọc"
              />
            )}
          </>
        );

        return (
          <li
            key={item.id}
            className={clsx(CARD, item.isUnread && "ring-1 ring-accent/40")}
          >
            {item.href ? (
              <Link href={item.href} className={`${ROW} active:bg-line/50`}>
                {content}
              </Link>
            ) : (
              <div className={ROW}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
};
