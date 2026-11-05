"use client";

import clsx from "clsx";

import { useChatUnread } from "@/features/chat/hooks/use-chat-unread";

interface UnreadBadgeProps {
  count: number;
  className?: string;
}

const MAX_SHOWN = 9;

// Red dot with the number (9+ above nine), for the tab icon and later the
// admin header. Renders nothing at zero.
export const UnreadBadge = ({ count, className }: UnreadBadgeProps) => {
  if (count <= 0) {
    return null;
  }
  return (
    <span
      role="status"
      aria-label={`${count} tin nhắn chưa đọc`}
      className={clsx(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-bold text-white",
        className,
      )}
    >
      {count > MAX_SHOWN ? `${MAX_SHOWN}+` : count}
    </span>
  );
};

interface AdminUnreadBadgeProps {
  // Server-rendered total, shown until the first live poll.
  initialCount: number;
  className?: string;
}

// The admin's live total: polls `?as=admin` and refreshes on inbox events,
// so it drops when a conversation is read and rises when a message arrives.
export const AdminUnreadBadge = ({
  initialCount,
  className,
}: AdminUnreadBadgeProps) => (
  <UnreadBadge
    count={useChatUnread(false, "admin", initialCount)}
    className={className}
  />
);
