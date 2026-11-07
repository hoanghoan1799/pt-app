import type { Metadata } from "next";

import { listAdminAvatarUrls } from "@/features/avatar/services/avatar";
import { ChatInfo } from "@/features/chat/components/ChatInfo";
import { FALLBACK_PEER_NAME } from "@/features/chat/constants/messages";
import { listGalleryPhotos } from "@/features/chat/services/chat-gallery";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  EMPTY_CHAT_PROFILE,
  loadChatProfile,
} from "@/features/chat/services/chat-profile";
import {
  findConversationByUserId,
  findLatestAdminSender,
} from "@/features/chat/services/chat-queries";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { INFO_PREVIEW_COUNT } from "@/features/chat/utils/gallery-rules";
import { requireUser } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Thông tin cuộc trò chuyện" };

// The trainee's chat info page (KAN-160). The chat may be locked: the page
// still opens, read-only, like the thread does.
const MessagesInfoPage = async () => {
  const user = await requireUser();
  const conversation = await findConversationByUserId(user.id);
  const [profile, sender, adminAvatars, gallery] = await Promise.all([
    conversation ? loadChatProfile(conversation.id) : EMPTY_CHAT_PROFILE,
    conversation ? findLatestAdminSender(conversation.id) : null,
    listAdminAvatarUrls(),
    conversation
      ? listGalleryPhotos(conversation.id, { limit: INFO_PREVIEW_COUNT })
      : { items: [], nextCursor: null },
  ]);

  return (
    <ChatInfo
      viewer={{ role: "user" }}
      userId={user.id}
      conversationId={conversation?.id ?? null}
      peerName={sender?.name ?? FALLBACK_PEER_NAME}
      selfName={user.name}
      initialProfile={profile}
      chatEnabled={isChatEnabled(user)}
      peerAvatarUrl={
        sender?.id != null ? (adminAvatars.get(sender.id) ?? null) : null
      }
      paths={chatPaths("user", user.id)}
      preview={gallery.items}
    />
  );
};

export default MessagesInfoPage;
