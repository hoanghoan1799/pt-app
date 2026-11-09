"use client";

import clsx from "clsx";
import { MessageCircle, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { Input } from "@/components/common/Input";
import { Spinner } from "@/components/common/Spinner";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  PAGE_CONTAINER,
  SECTION_TITLE,
} from "@/constants/styles";
import { ChatInboxList } from "@/features/chat/components/ChatInboxList";
import { HiddenUserList } from "@/features/chat/components/HiddenUserList";
import { useHiddenReveal } from "@/features/chat/hooks/use-hidden-reveal";
import {
  hideUsersAction,
  unhideUserAction,
} from "@/features/chat/services/chat-hidden-actions";
import type {
  InboxItem,
  InboxWithoutConversation,
} from "@/features/chat/services/chat-queries";
import { matchesInboxSearch } from "@/features/chat/utils/inbox-search";
import { isOnline } from "@/features/chat/utils/presence";
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

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
    <MessageCircle className="size-10 text-muted" aria-hidden />
    <p className="text-sm text-muted">{text}</p>
  </div>
);

// The admin inbox body (KAN-164): name search, "Chọn" mode to hide trainees, and
// the temporary list of hidden trainees revealed by typing the passcode.
export const AdminInbox = ({
  items,
  fresh,
  adminId,
  nowMs,
  hasPasscode,
  isUnreadOnly,
  filters,
}: AdminInboxProps) => {
  const locale = useLocale();
  const t = useTranslations("chat.adminInbox");
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
  const hiddenItems = revealed?.conversations ?? [];
  // Hidden trainees nobody has written to yet have no inbox row.
  const hiddenWithoutChat = (revealed?.users ?? []).filter(
    (user) => !hiddenItems.some((item) => item.userId === user.userId),
  );
  const isRevealing = hiddenItems.length + hiddenWithoutChat.length > 0;
  const isEmpty = shownItems.length === 0 && shownFresh.length === 0;
  const isSearching = query.trim() !== "";

  const exitSelect = () => {
    setIsSelecting(false);
    setSelected(new Set());
  };

  const startSelect = () => {
    if (!hasPasscode) {
      toast.info(t("passcodeRequired"));
      return;
    }
    setIsSelecting(true);
  };

  const toggle = (userId: number) =>
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });

  const hideSelected = () => {
    if (!hasPasscode) {
      toast.info(t("passcodeRequired"));
      return;
    }
    const ids = [...selected];

    if (ids.length === 0) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await hideUsersAction(ids);

        if (result.status === "success") {
          toast.success(t("hiddenToast", { count: ids.length }));
          exitSelect();
          router.refresh();
          return;
        }
        toast.error(result.message ?? t("hideFailed"));
      } catch {
        toast.error(t("hideFailed"));
      }
    });
  };

  const unhide = (userId: number) => {
    startTransition(async () => {
      try {
        const result = await unhideUserAction(userId);

        if (result.status === "success") {
          remove(userId);
          router.refresh();
          return;
        }
        toast.error(t("unhideFailed"));
      } catch {
        toast.error(t("unhideFailed"));
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
        <Input
          type="search"
          clearable
          leadingIcon={<Search className="size-4" aria-hidden />}
          wrapperClassName="min-w-0 flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          autoComplete="off"
          enterKeyHint="search"
        />
        {!isSelecting && (
          <button
            type="button"
            onClick={startSelect}
            className="inline-flex min-h-12 shrink-0 items-center rounded-xl px-3 text-base font-semibold text-accent transition active:bg-line"
          >
            {t("select")}
          </button>
        )}
      </div>
      {filters}
      {isRevealing ? (
        <section className="space-y-2" aria-label={t("hiddenSection")}>
          <h2 className={SECTION_TITLE}>{t("hiddenSection")}</h2>
          {hiddenItems.length > 0 && (
            <ChatInboxList
              items={hiddenItems}
              adminId={adminId}
              nowMs={nowMs}
              onUnhide={unhide}
              isBusy={isPending}
            />
          )}
          {hiddenWithoutChat.length > 0 && (
            <HiddenUserList
              users={hiddenWithoutChat}
              onUnhide={unhide}
              isBusy={isPending}
            />
          )}
        </section>
      ) : (
        <>
          {isEmpty && (
            <EmptyState
              text={
                isSearching
                  ? t("emptySearch")
                  : isUnreadOnly
                    ? t("emptyUnread")
                    : t("emptyAll")
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
          {!isUnreadOnly && shownFresh.length > 0 && (
            <section className="space-y-2">
              <h2 className={SECTION_TITLE}>{t("freshSection")}</h2>
              <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
                {shownFresh.map((member) => {
                  const online = isOnline(member.lastSeenAt, now);
                  const lastSeen = shortLastSeen(
                    member.lastSeenAt,
                    now,
                    locale,
                  );
                  const content = (
                    <>
                      {online && (
                        <span
                          role="img"
                          aria-label={t("online")}
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
                        <label className={clsx(rowClass, "cursor-pointer")}>
                          <input
                            type="checkbox"
                            checked={selected.has(member.userId)}
                            onChange={() => toggle(member.userId)}
                            aria-label={t("selectRow", {
                              name: member.userName,
                            })}
                            className="size-5 shrink-0 accent-accent"
                          />
                          {content}
                        </label>
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
            aria-label={t("hideToolbar")}
          >
            <button
              type="button"
              onClick={exitSelect}
              className={`${BUTTON_SECONDARY} flex-1`}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || isPending}
              aria-busy={isPending}
              onClick={hideSelected}
              className={`${BUTTON_PRIMARY} flex-1`}
            >
              {isPending && <Spinner size="md" />}
              {t("hideCount", { count: selected.size })}
            </button>
          </div>
        </div>
      )}
    </main>
  );
};
