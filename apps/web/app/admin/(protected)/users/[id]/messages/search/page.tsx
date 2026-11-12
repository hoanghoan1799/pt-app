import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ChatSearch } from "@/features/chat/components/ChatSearch";
import { findTraineeChatHeader } from "@/features/chat/services/chat-queries";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { requireAdmin } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("adminPages.messagesSearch");

  return { title: t("metaTitle") };
};

// The admin's message search in one trainee's conversation (KAN-160). A
// hidden trainee is "not found" unless revealed.
const AdminMessagesSearchPage = async ({
  params,
}: PageProps<"/admin/users/[id]/messages/search">) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const userId = Number(id);
  const header = Number.isSafeInteger(userId)
    ? await findTraineeChatHeader(userId)
    : null;

  if (!header) {
    notFound();
  }

  return (
    <ChatSearch
      viewer={{ role: "admin", adminId: admin.id, peerName: header.userName }}
      // Without a conversation there is nothing to find; 0 never exists.
      endpoint={`/api/admin/chat/${header.conversationId ?? 0}/search`}
      paths={chatPaths("admin", header.userId)}
      nicknames={header.profile.nicknames}
    />
  );
};

export default AdminMessagesSearchPage;
