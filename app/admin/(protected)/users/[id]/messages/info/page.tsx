import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import {
  getAvatarUrl,
  listAdminAvatarUrls,
} from "@/features/avatar/services/avatar";
import { ChatInfo } from "@/features/chat/components/ChatInfo";
import { listGalleryPhotos } from "@/features/chat/services/chat-gallery";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import { loadChatProfile } from "@/features/chat/services/chat-profile";
import {
  findConversationByUserId,
  getOrCreateConversation,
} from "@/features/chat/services/chat-queries";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { INFO_PREVIEW_COUNT } from "@/features/chat/utils/gallery-rules";
import { requireAdmin } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";
import { findUserById } from "@/services/users";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("adminPages.messagesInfo");

  return { title: t("metaTitle") };
};

// The admin's chat info page for one trainee (KAN-160). A trainee this admin
// hid is "not found" unless revealed, like the chat itself.
const AdminMessagesInfoPage = async ({
  params,
}: PageProps<"/admin/users/[id]/messages/info">) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const locale = await getLocale();
  const user = await findUserById(Number(id));

  if (!user || !(await canAdminAccessUser(admin.id, user.id))) {
    notFound();
  }
  const chatEnabled = isChatEnabled(user);
  // Same as the thread: the colour and hide actions need a conversation.
  const conversation = chatEnabled
    ? await getOrCreateConversation(user.id)
    : await findConversationByUserId(user.id);
  const [profile, traineeAvatar, gallery] = await Promise.all([
    conversation ? loadChatProfile(conversation.id) : undefined,
    getAvatarUrl("user", user.id),
    conversation
      ? listGalleryPhotos(conversation.id, {
          limit: INFO_PREVIEW_COUNT,
          locale,
        })
      : { items: [], nextCursor: null },
    listAdminAvatarUrls(),
  ]);

  return (
    <ChatInfo
      viewer={{
        role: "admin",
        adminId: admin.id,
        adminName: admin.username,
        peerName: user.name,
      }}
      userId={user.id}
      conversationId={conversation?.id ?? null}
      peerName={user.name}
      selfName={admin.username}
      initialProfile={profile ?? { nicknames: {}, colors: {} }}
      chatEnabled={chatEnabled}
      peerAvatarUrl={traineeAvatar}
      paths={chatPaths("admin", user.id)}
      preview={gallery.items}
    />
  );
};

export default AdminMessagesInfoPage;
