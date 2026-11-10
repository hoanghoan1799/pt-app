import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { MemberSectionTabs } from "@/components/layout/MemberSectionTabs";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import {
  getAvatarUrl,
  listAdminAvatarUrls,
} from "@/features/avatar/services/avatar";
import { AdminChatThread } from "@/features/chat/components/AdminChatThread";
import { ChatLockSwitch } from "@/features/chat/components/ChatLockSwitch";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import { loadChatProfile } from "@/features/chat/services/chat-profile";
import {
  findConversationByUserId,
  getOrCreateConversation,
  getPeerReadCursor,
  listMessages,
  listMessagesAround,
} from "@/features/chat/services/chat-queries";
import { loadCoachReplyPostFor } from "@/features/chat/services/chat-reply-post";
import { parseJumpId } from "@/features/chat/utils/chat-links";
import { serializeMessage } from "@/features/chat/utils/chat-thread-rules";
import { serializeLastSeen } from "@/features/chat/utils/presence";
import { isEmbedParam } from "@/features/chat-bubbles/utils/bubble-links";
import { adminActorKey } from "@/features/contact-aliases/utils/alias-rules";
import { actorOfAdmin } from "@/features/social/services/post-context";
import { parseDmId } from "@/features/social/utils/dm-rules";
import { toAdminRole } from "@/services/admin-scope";
import { requireAdmin } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";
import { findUserById } from "@/services/users";
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
  const user = await findUserById(Number(id));

  if (!user || !(await canAdminAccessUser(admin.id, user.id))) {
    notFound();
  }
  const query = await searchParams;
  const schedule = resolveSchedule(
    { week: readSearchParam(query.week) },
    getTodayDate(TIME_ZONE),
  );
  const chatEnabled = isChatEnabled(user);
  // The realtime token and the messages route need a conversation to exist.
  const conversation = chatEnabled
    ? await getOrCreateConversation(user.id)
    : await findConversationByUserId(user.id);
  const isEmbed = isEmbedParam(query.embed);
  // The bubble panel has its own header; no section tabs or lock row there.
  const below = isEmbed ? undefined : (
    <>
      <MemberSectionTabs
        userId={user.id}
        active="messages"
        weekStart={schedule.weekStart}
      />
      <div className={`${PAGE_CONTAINER} pt-1`}>
        <ChatLockSwitch userId={user.id} enabled={chatEnabled} />
      </div>
    </>
  );

  if (!conversation) {
    return (
      <>
        <AppHeader
          title={t("threadTitle", { name: user.name })}
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
  const viewer = actorOfAdmin({ id: admin.id, role: toAdminRole(admin.role) });
  const jumpId = parseJumpId(query.m);
  // `?replyPost=<id>`: this trainee's post quoted above the composer; only when
  // the chat is open for writing and the admin may see that post.
  const replyPostId = parseDmId(readSearchParam(query.replyPost) ?? "");
  const replyPost =
    replyPostId !== null && chatEnabled
      ? await loadCoachReplyPostFor(viewer, replyPostId, user.id)
      : null;
  const around =
    jumpId === null
      ? null
      : await listMessagesAround(conversation.id, jumpId, viewer);
  const [
    { messages, hasMore },
    peerReadUpTo,
    profile,
    adminAvatars,
    traineeAvatarUrl,
  ] = await Promise.all([
    around ?? listMessages(conversation.id, {}, viewer),
    getPeerReadCursor(conversation.id, "admin"),
    loadChatProfile(conversation.id, adminActorKey(admin.id)),
    listAdminAvatarUrls(),
    getAvatarUrl("user", user.id),
  ]);
  const avatars: Record<string, string> = Object.fromEntries(
    [...adminAvatars].map(([id, url]) => [`admin:${id}`, url]),
  );

  if (traineeAvatarUrl) {
    avatars.user = traineeAvatarUrl;
  }

  return (
    <AdminChatThread
      // The switch refreshes the page; remount so the thread picks up the new
      // lock state at once instead of on the next poll.
      key={chatEnabled ? "enabled" : "locked"}
      below={below}
      isEmbed={isEmbed}
      userName={user.name}
      userId={user.id}
      conversationId={conversation.id}
      replyPost={replyPost}
      jumpToId={around ? jumpId : null}
      viewer={{
        role: "admin",
        adminId: admin.id,
        adminName: admin.username,
        peerName: user.name,
      }}
      avatars={avatars}
      emptyText={t("emptyText")}
      ariaLabel={t("threadAriaLabel", { name: user.name })}
      initial={{
        messages: messages.map(serializeMessage),
        // Read before the messages: a change made in between is fetched again,
        // never missed.
        lastChangeAt: conversation.lastChangeAt?.getTime() ?? 0,
        hasMore,
        chatEnabled,
        peerReadUpTo,
        peerLastSeenAt: serializeLastSeen(user.lastSeenAt),
        profile,
      }}
    />
  );
};

export default AdminMessagesPage;
