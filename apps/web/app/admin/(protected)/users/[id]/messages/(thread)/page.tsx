import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { MemberSectionTabs } from "@/components/layout/MemberSectionTabs";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { listAdminAvatarUrls } from "@/features/avatar/services/avatar";
import { AdminChatThread } from "@/features/chat/components/AdminChatThread";
import { ChatLockSwitch } from "@/features/chat/components/ChatLockSwitch";
import {
  findTraineeChatHeader,
  loadConversationThread,
  loadConversationThreadAround,
} from "@/features/chat/services/chat-queries";
import { loadCoachReplyPostFor } from "@/features/chat/services/chat-reply-post";
import { parseJumpId } from "@/features/chat/utils/chat-links";
import { serializeMessage } from "@/features/chat/utils/chat-thread-rules";
import { isEmbedParam } from "@/features/chat-bubbles/utils/bubble-links";
import { parseDmId } from "@/features/social/utils/dm-rules";
import { requireAdmin } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";
import { getTodayDate, resolveSchedule } from "@/utils/week";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("adminPages.messages");

  return { title: t("metaTitle") };
};

const AdminMessagesPage = async ({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]/messages">) => {
  const admin = await requireAdmin();
  const t = await getTranslations("adminPages.messages");

  const { id } = await params;
  const userId = Number(id);
  // The API answers "not found" for a trainee outside this admin's workspace
  // and for one they hid and have not revealed (KAN-163, R2).
  const header = Number.isSafeInteger(userId)
    ? await findTraineeChatHeader(userId)
    : null;

  if (!header) {
    notFound();
  }
  const query = await searchParams;
  const schedule = resolveSchedule(
    { week: readSearchParam(query.week) },
    getTodayDate(TIME_ZONE),
  );
  const chatEnabled = header.chatEnabled;
  const conversationId = header.conversationId;
  const isEmbed = isEmbedParam(query.embed);
  // The bubble panel has its own header; no section tabs or lock row there.
  const below = isEmbed ? undefined : (
    <>
      <MemberSectionTabs
        userId={header.userId}
        active="messages"
        weekStart={schedule.weekStart}
      />
      <div className={`${PAGE_CONTAINER} pt-1`}>
        <ChatLockSwitch userId={header.userId} enabled={chatEnabled} />
      </div>
    </>
  );

  // Locked chat and nothing said yet: there is nothing to open.
  if (conversationId === null && !chatEnabled) {
    return (
      <>
        <AppHeader
          title={t("threadTitle", { name: header.userName })}
          backHref={ROUTES.ADMIN_MESSAGES}
        />
        {below}
        <main className={`${PAGE_CONTAINER} pt-10`}>
          <p className="px-6 text-center text-sm text-muted">
            {t("lockedEmptyText")}
          </p>
        </main>
      </>
    );
  }
  const jumpId = parseJumpId(query.m);
  // `?replyPost=<id>`: this trainee's post quoted above the composer; only when
  // the chat is open for writing and the admin may see that post.
  const replyPostId = parseDmId(readSearchParam(query.replyPost) ?? "");
  const replyPost =
    replyPostId !== null && chatEnabled
      ? await loadCoachReplyPostFor("admin", replyPostId, header.userId)
      : null;
  const around =
    jumpId === null || conversationId === null
      ? null
      : await loadConversationThreadAround(conversationId, jumpId);
  const [thread, adminAvatars] = await Promise.all([
    around ??
      (conversationId === null ? null : loadConversationThread(conversationId)),
    listAdminAvatarUrls(),
  ]);
  const avatars: Record<string, string> = Object.fromEntries(
    [...adminAvatars].map(([adminId, url]) => [`admin:${adminId}`, url]),
  );

  if (header.avatarUrl) {
    avatars.user = header.avatarUrl;
  }

  return (
    <AdminChatThread
      // The switch refreshes the page; remount so the thread picks up the new
      // lock state at once instead of on the next poll.
      key={chatEnabled ? "enabled" : "locked"}
      below={below}
      isEmbed={isEmbed}
      userName={header.userName}
      userId={header.userId}
      conversationId={conversationId}
      replyPost={replyPost}
      jumpToId={around ? jumpId : null}
      viewer={{
        role: "admin",
        adminId: admin.id,
        adminName: admin.username,
        peerName: header.userName,
      }}
      avatars={avatars}
      emptyText={t("emptyText")}
      ariaLabel={t("threadAriaLabel", { name: header.userName })}
      initial={{
        messages: (thread?.messages ?? []).map(serializeMessage),
        lastChangeAt: thread?.lastChangeAt ?? 0,
        hasMore: thread?.hasMore ?? false,
        chatEnabled,
        peerReadUpTo: thread?.peerReadUpTo ?? 0,
        peerLastSeenAt: header.lastSeenAt,
        profile: thread?.profile ?? header.profile,
      }}
    />
  );
};

export default AdminMessagesPage;
