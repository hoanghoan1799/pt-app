import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { AdminInbox } from "@/features/chat/components/AdminInbox";
import { InboxLiveRefresh } from "@/features/chat/components/InboxLiveRefresh";
import { PushOptInCard } from "@/features/chat/components/PushOptInCard";
import { listAdminInbox } from "@/features/chat/services/chat-queries";
import { requireAdmin } from "@/services/auth-guard";
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

  return (
    <>
      <AppHeader title="Tin nhắn" backHref={ROUTES.ADMIN} />
      <InboxLiveRefresh />
      <AdminInbox
        items={items}
        fresh={fresh}
        adminId={admin.id}
        nowMs={getRequestTime()}
        hasPasscode={admin.hasPasscode}
        isUnreadOnly={isUnreadOnly}
        filters={
          <>
            <PushOptInCard role="admin" />
            <nav aria-label="Lọc tin nhắn" className="flex gap-2">
              {FILTERS.map((filter) => {
                const isActive =
                  (filter.key === UNREAD_FILTER) === isUnreadOnly;

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
          </>
        }
      />
    </>
  );
};

export default AdminMessagesInboxPage;
