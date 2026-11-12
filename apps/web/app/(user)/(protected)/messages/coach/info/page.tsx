import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ChatInfo } from "@/features/chat/components/ChatInfo";
import { listGalleryPhotos } from "@/features/chat/services/chat-gallery";
import { loadMyThread } from "@/features/chat/services/chat-queries";
import { listAdminAvatarUrls } from "@/features/chat/services/chat-team";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { INFO_PREVIEW_COUNT } from "@/features/chat/utils/gallery-rules";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("chat.pages");

  return { title: t("infoTitle") };
};

// The trainee's chat info page (KAN-160). The chat may be locked: the page
// still opens, read-only, like the thread does.
const MessagesInfoPage = async () => {
  const t = await getTranslations("chat.shared");
  const user = await requireUser();
  // The thread answer carries the nicknames, colours, the chat switch and the
  // PT who wrote last; only its first page of messages is not needed here.
  const [state, adminAvatars] = await Promise.all([
    loadMyThread({ after: 2_000_000_000 }),
    listAdminAvatarUrls("user"),
  ]);
  const sender = state.latestPt;
  const gallery = await listGalleryPhotos(
    state.conversationId,
    INFO_PREVIEW_COUNT,
  );

  return (
    <ChatInfo
      viewer={{ role: "user" }}
      userId={user.id}
      conversationId={state.conversationId}
      peerName={sender?.name ?? t("fallbackPeer")}
      initialProfile={state.profile}
      chatEnabled={state.chatEnabled}
      peerAvatarUrl={
        sender?.id != null ? (adminAvatars.get(sender.id) ?? null) : null
      }
      paths={chatPaths("user", user.id)}
      preview={gallery.items}
    />
  );
};

export default MessagesInfoPage;
