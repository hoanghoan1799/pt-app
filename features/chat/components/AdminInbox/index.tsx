"use client";

import clsx from "clsx";
import { MessageCircle, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  INPUT,
  PAGE_CONTAINER,
  SECTION_TITLE,
} from "@/constants/styles";
import { ChatInboxList } from "@/features/chat/components/ChatInboxList";
import { HIDDEN_CHAT_MESSAGES } from "@/features/chat/constants/messages";
import { useHiddenReveal } from "@/features/chat/hooks/use-hidden-reveal";
import {
  hideConversationsAction,
  unhideConversationAction,
} from "@/features/chat/services/chat-hidden-actions";
import type {
  InboxItem,
  InboxWithoutConversation,
} from "@/features/chat/services/chat-queries";
import { matchesInboxSearch } from "@/features/chat/utils/inbox-search";
import { isOnline, ONLINE_LABEL } from "@/features/chat/utils/presence";
import { shortLastSeen } from "@/features/chat/utils/presence-status";
import { getAdminMessagesPath } from "@/utils/routes";

interface AdminInboxProps {
  items: InboxItem[];
  // Trainees nobody has written to yet.
  fresh: InboxWithoutConversation[];
  adminId: number;
  nowMs: number;
  hasPasscode: boolean;
  isUnreadOnly: boolean;
  // The filter tabs, rendered between the search box and the list.
  filters: ReactNode;
}

const HIDE_FAILED = "Không ẩn được. Thử lại nhé.";
const UNHIDE_FAILED = "Không bỏ ẩn được. Thử lại nhé.";

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
    <MessageCircle className="size-10 text-muted" aria-hidden />
    <p className="text-sm text-muted">{text}</p>
  </div>
);

// The admin inbox body (KAN-164): name search, "Chọn" mode to hide chats, and
// the temporary list of hidden chats revealed by typing the passcode.
export const AdminInbox = ({
  items,
  fresh,
  adminId,
  nowMs,
  hasPasscode,
  isUnreadOnly,
  filters,
}: AdminInboxProps) => {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isSelecting, setIsSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const { revealed, remove } = useHiddenReveal(query, hasPasscode);
  const now = useMemo(() => new Date(nowMs), [nowMs]);

  const shownItems = useMemo(
    () =>
      items.filter((item) =>
        matchesInboxSearch(query, item.displayName, item.userName),
      ),
    [items, query],
  );
  const shownFresh = useMemo(
    () => fresh.filter((member) => matchesInboxSearch(query, member.userName)),
    [fresh, query],
  );
  const hiddenItems = revealed ?? [];
  const isRevealing = hiddenItems.length > 0;
  const isEmpty = shownItems.length === 0 && shownFresh.length === 0;
  const isSearching = query.trim() !== "";

  const exitSelect = () => {
    setIsSelecting(false);
    setSelected(new Set());
  };

  const startSelect = () => {
    if (!hasPasscode) {
      toast.info(HIDDEN_CHAT_MESSAGES.PASSCODE_REQUIRED);
      return;
    }
    setIsSelecting(true);
  };

  const toggle = (conversationId: number) =>
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(conversationId)) {
        next.delete(conversationId);
      } else {
        next.add(conversationId);
      }
      return next;
    });

  const hideSelected = () => {
    if (!hasPasscode) {
      toast.info(HIDDEN_CHAT_MESSAGES.PASSCODE_REQUIRED);
      return;
    }
    const ids = [...selected];

    if (ids.length === 0) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await hideConversationsAction(ids);

        if (result.status === "success") {
          toast.success(`Đã ẩn ${ids.length} cuộc trò chuyện`);
          exitSelect();
          router.refresh();
          return;
        }
        toast.error(result.message ?? HIDE_FAILED);
      } catch {
        toast.error(HIDE_FAILED);
      }
    });
  };

  const unhide = (conversationId: number) => {
    startTransition(async () => {
      try {
        const result = await unhideConversationAction(conversationId);

        if (result.status === "success") {
          remove(conversationId);
          router.refresh();
          return;
        }
        toast.error(UNHIDE_FAILED);
      } catch {
        toast.error(UNHIDE_FAILED);
      }
    });
  };

  return (
    <main
      className={clsx(
        PAGE_CONTAINER,
        "space-y-5 pt-4",
        isSelecting
          ? "pb-[calc(env(safe-area-inset-bottom)+6rem)]"
          : "pb-[calc(env(safe-area-inset-bottom)+2rem)]",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên"
            aria-label="Tìm theo tên"
            autoComplete="off"
            enterKeyHint="search"
            className={`${INPUT} pl-10`}
          />
        </div>
        {!isSelecting && (
          <button
            type="button"
            onClick={startSelect}
            className="inline-flex min-h-12 shrink-0 items-center rounded-xl px-3 text-base font-semibold text-accent transition active:bg-line"
          >
            Chọn
          </button>
        )}
      </div>
      {filters}
      {isRevealing ? (
        <section className="space-y-2" aria-label="Cuộc trò chuyện đã ẩn">
          <h2 className={SECTION_TITLE}>Cuộc trò chuyện đã ẩn</h2>
          <ChatInboxList
            items={hiddenItems}
            adminId={adminId}
            nowMs={nowMs}
            onUnhide={unhide}
            isBusy={isPending}
          />
        </section>
      ) : (
        <>
          {isEmpty && (
            <EmptyState
              text={
                isSearching
                  ? "Không tìm thấy cuộc trò chuyện nào"
                  : isUnreadOnly
                    ? "Không có tin nhắn chưa đọc"
                    : "Chưa có cuộc trò chuyện nào"
              }
            />
          )}
          {shownItems.length > 0 && (
            <ChatInboxList
              items={shownItems}
              adminId={adminId}
              nowMs={nowMs}
              isSelecting={isSelecting}
              selectedIds={selected}
              onToggle={toggle}
            />
          )}
          {/* Nobody has chatted yet: nothing to hide, so not selectable. */}
          {!isUnreadOnly && shownFresh.length > 0 && (
            <section className="space-y-2">
              <h2 className={SECTION_TITLE}>Chưa có tin nhắn</h2>
              <ul
                className={`${CARD} divide-y divide-line overflow-hidden ${isSelecting ? "opacity-50" : ""}`}
              >
                {shownFresh.map((member) => {
                  const online = isOnline(member.lastSeenAt, now);
                  const lastSeen = shortLastSeen(member.lastSeenAt, now);
                  const content = (
                    <>
                      {online && (
                        <span
                          role="img"
                          aria-label={ONLINE_LABEL}
                          className="size-2.5 shrink-0 rounded-full bg-success"
                        />
                      )}
                      <Avatar
                        name={member.userName}
                        src={member.avatarUrl}
                        tone="soft"
                        className="size-8 text-xs"
                      />
                      <span className="truncate">{member.userName}</span>
                      {lastSeen && (
                        <span className="shrink-0 text-xs font-normal text-muted">
                          {lastSeen}
                        </span>
                      )}
                    </>
                  );
                  const rowClass =
                    "flex min-h-12 items-center gap-2 px-4 py-3 font-medium transition active:bg-line";

                  return (
                    <li key={member.userId}>
                      {isSelecting ? (
                        <div className={rowClass} aria-disabled="true">
                          {content}
                        </div>
                      ) : (
                        <Link
                          href={getAdminMessagesPath(member.userId)}
                          className={rowClass}
                        >
                          {content}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
      {isSelecting && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]">
          <div
            className={`${PAGE_CONTAINER} flex items-center gap-3 py-3`}
            role="toolbar"
            aria-label="Ẩn cuộc trò chuyện"
          >
            <button
              type="button"
              onClick={exitSelect}
              className={`${BUTTON_SECONDARY} flex-1`}
            >
              Huỷ
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || isPending}
              onClick={hideSelected}
              className={`${BUTTON_PRIMARY} flex-1`}
            >
              Ẩn ({selected.size})
            </button>
          </div>
        </div>
      )}
    </main>
  );
};
