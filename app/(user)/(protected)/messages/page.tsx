import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { Avatar } from "@/components/common/Avatar";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { CARD, PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { countUnreadForUser } from "@/features/chat/services/chat-queries";
import { DmInboxRefresh } from "@/features/social/components/DmInboxRefresh";
import { listDmInbox } from "@/features/social/services/dm-queries";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { dmPath } from "@/features/social/utils/dm-rules";
import { requireUser } from "@/services/auth-guard";
import { formatRelativeTime } from "@/utils/time";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("chat.pages");

  return { title: t("messagesTitle") };
};

const ROW = `${CARD} flex items-center gap-3 p-3 active:bg-line/60`;

const UnreadDot = ({ label }: { label: string }) => (
  <span
    role="status"
    aria-label={label}
    className="size-3 shrink-0 rounded-full bg-danger"
  />
);

// The Messages tab: the coach chat first (unchanged, under /messages/coach),
// then the old read-only chats with friends (shown only when any exist).
const MessagesInboxPage = async () => {
  const t = await getTranslations("chat.pages");
  const dm = await getTranslations("social.dm");
  const locale = await getLocale();
  const user = await requireUser();
  const [coachUnread, chats] = await Promise.all([
    countUnreadForUser(user.id),
    hasAcceptedTerms(user) ? listDmInbox(user.id, locale) : [],
  ]);

  return (
    <>
      <AppHeader title={dm("inboxTitle")} />
      <DmInboxRefresh />
      <main
        className={`${PAGE_CONTAINER} space-y-3 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <ul className="space-y-2">
          <li>
            <Link href={ROUTES.MESSAGES_COACH} className={ROW}>
              <Avatar name="PT" className="size-12 shrink-0 text-base" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-fg">
                  {dm("coachTitle")}
                </span>
                <span className="block truncate text-sm text-muted">
                  {t("coachSubtitle")}
                </span>
              </span>
              {coachUnread > 0 && <UnreadDot label={t("unreadDot")} />}
            </Link>
          </li>
        </ul>
        {chats.length > 0 && (
          <>
            <h2 className={SECTION_TITLE}>{t("friendsSection")}</h2>
            <p className="text-sm text-muted">{dm("archivedNote")}</p>
            <ul className="space-y-2">
              {chats.map((chat) => (
                <li key={chat.conversationId}>
                  <Link href={dmPath(chat.conversationId)} className={ROW}>
                    <Avatar
                      name={chat.name}
                      src={chat.avatarUrl}
                      className="size-12 shrink-0 text-base"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate ${chat.unread > 0 ? "font-bold" : "font-semibold"} text-fg`}
                        >
                          {chat.name}
                        </span>
                        {chat.lastMessageAt && (
                          <span className="shrink-0 text-xs text-muted">
                            {formatRelativeTime(
                              new Date(chat.lastMessageAt).getTime(),
                              TIME_ZONE,
                              undefined,
                              locale,
                            )}
                          </span>
                        )}
                      </span>
                      <span
                        className={`block truncate text-sm ${chat.unread > 0 ? "font-semibold text-fg" : "text-muted"}`}
                      >
                        {chat.preview}
                      </span>
                    </span>
                    {chat.unread > 0 && <UnreadDot label={t("unreadDot")} />}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
};

export default MessagesInboxPage;
