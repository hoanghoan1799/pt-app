import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ChatInfo } from "@/features/chat/components/ChatInfo";
import { listGalleryPhotos } from "@/features/chat/services/chat-gallery";
import { findTraineeChatHeader } from "@/features/chat/services/chat-queries";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { INFO_PREVIEW_COUNT } from "@/features/chat/utils/gallery-rules";
import { requireAdmin } from "@/services/auth-guard";

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
  const userId = Number(id);
  // The API answers "not found" for a trainee outside this admin's workspace
  // and for one they hid and have not revealed.
  const header = Number.isSafeInteger(userId)
    ? await findTraineeChatHeader(userId)
    : null;

  if (!header) {
    notFound();
  }
  const conversationId = header.conversationId;
  const gallery = await listGalleryPhotos(
    conversationId,
    INFO_PREVIEW_COUNT,
    true,
  );

  return (
    <ChatInfo
      viewer={{
        role: "admin",
        adminId: admin.id,
        adminName: admin.username,
        peerName: header.userName,
      }}
      userId={header.userId}
      conversationId={conversationId}
      peerName={header.userName}
      initialProfile={header.profile}
      chatEnabled={header.chatEnabled}
      peerAvatarUrl={header.avatarUrl}
      paths={chatPaths("admin", header.userId)}
      preview={gallery.items}
    />
  );
};

export default AdminMessagesInfoPage;
