import clsx from "clsx";
import { Lock } from "lucide-react";
import Link from "next/link";

import { CARD } from "@/constants/styles";
import type { InboxItem } from "@/features/chat/services/chat-queries";
import {
  formatInboxTime,
  inboxPreviewPrefix,
} from "@/features/chat/utils/chat-inbox";
import { initialsOf } from "@/features/chat/utils/chat-thread-rules";
import { getAdminMessagesPath } from "@/utils/routes";

interface ChatInboxListProps {
  items: InboxItem[];
  adminId: number;
  nowMs: number;
}

const MAX_SHOWN = 99;

// One row per conversation: initials avatar, name, "who: preview", relative
// time; bold with a count when there is unread, a lock when chat is off.
export const ChatInboxList = ({
  items,
  adminId,
  nowMs,
}: ChatInboxListProps) => (
  <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
    {items.map((item) => {
      const isUnread = item.unread > 0;
      const prefix = inboxPreviewPrefix(item, adminId);
      const preview = item.preview
        ? `${prefix}${item.preview}`
        : "Chưa có tin nhắn";
      const time = formatInboxTime(
        item.lastMessageAt ? item.lastMessageAt.getTime() : null,
        nowMs,
      );

      return (
        <li key={item.conversationId}>
          <Link
            href={getAdminMessagesPath(item.userId)}
            className="flex min-h-16 items-center gap-3 px-4 py-3 transition active:bg-line"
          >
            <span
              aria-hidden
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent"
            >
              {initialsOf(item.userName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span
                  className={clsx(
                    "flex min-w-0 items-center gap-1.5 text-fg",
                    isUnread ? "font-bold" : "font-semibold",
                  )}
                >
                  <span className="truncate">{item.userName}</span>
                  {!item.chatEnabled && (
                    <Lock
                      className="size-3.5 shrink-0 text-muted"
                      aria-label="Chat đang khoá"
                    />
                  )}
                </span>
                <span
                  className={clsx(
                    "shrink-0 text-xs",
                    isUnread ? "font-semibold text-accent" : "text-muted",
                  )}
                >
                  {time}
                </span>
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2">
                <span
                  className={clsx(
                    "truncate text-sm",
                    isUnread ? "font-semibold text-fg" : "text-muted",
                  )}
                >
                  {preview}
                </span>
                {isUnread && (
                  <span
                    role="status"
                    aria-label={`${item.unread} tin nhắn chưa đọc`}
                    className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center gap-1 rounded-full bg-accent px-1.5 text-[11px] leading-none font-bold text-accent-fg"
                  >
                    {item.unread > MAX_SHOWN ? `${MAX_SHOWN}+` : item.unread}
                  </span>
                )}
              </span>
            </span>
          </Link>
        </li>
      );
    })}
  </ul>
);
