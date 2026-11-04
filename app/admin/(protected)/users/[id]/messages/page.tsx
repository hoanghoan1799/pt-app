import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import { MemberSectionTabs } from "@/components/layout/MemberSectionTabs";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { ChatLockSwitch } from "@/features/chat/components/ChatLockSwitch";
import { ChatThread } from "@/features/chat/components/ChatThread";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  findConversationByUserId,
  getOrCreateConversation,
  getPeerReadCursor,
  listMessages,
} from "@/features/chat/services/chat-queries";
import { serializeMessage } from "@/features/chat/utils/chat-thread-rules";
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
  const header = (
    <>
      <AppHeader
        eyebrow="Nhắn tin với"
        title={user.name}
        backHref={ROUTES.ADMIN_MESSAGES}
      />
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
        {header}
        <main className={`${PAGE_CONTAINER} pt-10`}>
          <p className="px-6 text-center text-sm text-muted">
            {LOCKED_EMPTY_TEXT}
          </p>
        </main>
      </>
    );
  }
  const [{ messages, hasMore }, peerReadUpTo] = await Promise.all([
    listMessages(conversation.id),
    getPeerReadCursor(conversation.id, "admin"),
  ]);

  return (
    <ChatThread
      // The switch refreshes the page; remount so the thread picks up the new
      // lock state at once instead of on the next poll.
      key={chatEnabled ? "enabled" : "locked"}
      header={header}
      userId={user.id}
      conversationId={conversation.id}
      viewer={{
        role: "admin",
        adminId: admin.id,
        adminName: admin.username,
        peerName: user.name,
      }}
      emptyText={EMPTY_TEXT}
      ariaLabel={`Cuộc trò chuyện với ${user.name}`}
      initial={{
        messages: messages.map(serializeMessage),
        hasMore,
        chatEnabled,
        peerReadUpTo,
      }}
    />
  );
};

export default AdminMessagesPage;
