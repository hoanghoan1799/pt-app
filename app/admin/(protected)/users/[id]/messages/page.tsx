import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
} from "@/features/chat/services/chat-queries";
import { serializeMessage } from "@/features/chat/utils/chat-thread-rules";
import { serializeLastSeen } from "@/features/chat/utils/presence";
import { requireAdmin } from "@/services/auth-guard";
import { findUserById } from "@/services/users";
import { readSearchParam } from "@/utils/search-params";
import { getTodayDate, resolveSchedule } from "@/utils/week";

export const metadata: Metadata = { title: "Nhắn tin" };

const EMPTY_TEXT = "Chưa có tin nhắn nào với user này";
const LOCKED_EMPTY_TEXT =
  "Chat đang bị khoá và chưa có tin nhắn. Bật lại để nhắn tin.";

const AdminMessagesPage = async ({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]/messages">) => {
  const admin = await requireAdmin();

  const { id } = await params;
  const user = await findUserById(Number(id));

  if (!user) {
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
  const below = (
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
          title={`Nhắn tin với ${user.name}`}
          backHref={ROUTES.ADMIN_MESSAGES}
        />
        {below}
        <main className={`${PAGE_CONTAINER} pt-10`}>
          <p className="px-6 text-center text-sm text-muted">
            {LOCKED_EMPTY_TEXT}
          </p>
        </main>
      </>
    );
  }
  const [
    { messages, hasMore },
    peerReadUpTo,
    profile,
    adminAvatars,
    traineeAvatarUrl,
  ] = await Promise.all([
    listMessages(conversation.id),
    getPeerReadCursor(conversation.id, "admin"),
    loadChatProfile(conversation.id),
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
      userName={user.name}
      userId={user.id}
      conversationId={conversation.id}
      viewer={{
        role: "admin",
        adminId: admin.id,
        adminName: admin.username,
        peerName: user.name,
      }}
      avatars={avatars}
      emptyText={EMPTY_TEXT}
      ariaLabel={`Cuộc trò chuyện với ${user.name}`}
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
