import clsx from "clsx";
import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { CARD, PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { ChatInboxList } from "@/features/chat/components/ChatInboxList";
import { InboxLiveRefresh } from "@/features/chat/components/InboxLiveRefresh";
import { listAdminInbox } from "@/features/chat/services/chat-queries";
import { requireAdmin } from "@/services/auth-guard";
import { getAdminMessagesPath } from "@/utils/routes";
import { readSearchParam } from "@/utils/search-params";
import { getRequestTime } from "@/utils/time";

export const metadata: Metadata = { title: "Tin nhắn" };

const UNREAD_FILTER = "unread";

const FILTERS = [
  { key: "all", label: "Tất cả", href: ROUTES.ADMIN_MESSAGES },
  {
    key: UNREAD_FILTER,
    label: "Chưa đọc",
    href: `${ROUTES.ADMIN_MESSAGES}?filter=${UNREAD_FILTER}`,
  },
] as const;

const AdminMessagesInboxPage = async ({
  searchParams,
}: PageProps<"/admin/messages">) => {
  const admin = await requireAdmin();
  const query = await searchParams;
  const isUnreadOnly = readSearchParam(query.filter) === UNREAD_FILTER;
  const { conversations, withoutConversation } = await listAdminInbox(admin.id);
  const items = isUnreadOnly
    ? conversations.filter((item) => item.unread > 0)
    : conversations;
  // Trainees nobody has written to yet only belong to the full list.
  const fresh = isUnreadOnly ? [] : withoutConversation;
  const isEmpty = items.length === 0 && fresh.length === 0;

  return (
    <>
      <AppHeader title="Tin nhắn" backHref={ROUTES.ADMIN} />
      <InboxLiveRefresh />
      <main
        className={`${PAGE_CONTAINER} space-y-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <nav aria-label="Lọc tin nhắn" className="flex gap-2">
          {FILTERS.map((filter) => {
            const isActive = (filter.key === UNREAD_FILTER) === isUnreadOnly;

            return (
              <Link
                key={filter.key}
                href={filter.href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition",
                  isActive
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-line bg-surface text-muted active:bg-line",
                )}
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>
        {isEmpty && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <MessageCircle className="size-10 text-muted" aria-hidden />
            <p className="text-sm text-muted">
              {isUnreadOnly
                ? "Không có tin nhắn chưa đọc"
                : "Chưa có cuộc trò chuyện nào"}
            </p>
          </div>
        )}
        {items.length > 0 && (
          <ChatInboxList
            items={items}
            adminId={admin.id}
            nowMs={getRequestTime()}
          />
        )}
        {fresh.length > 0 && (
          <section className="space-y-2">
            <h2 className={SECTION_TITLE}>Chưa có tin nhắn</h2>
            <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
              {fresh.map((member) => (
                <li key={member.userId}>
                  <Link
                    href={getAdminMessagesPath(member.userId)}
                    className="flex min-h-12 items-center px-4 py-3 font-medium transition active:bg-line"
                  >
                    {member.userName}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
};

export default AdminMessagesInboxPage;
