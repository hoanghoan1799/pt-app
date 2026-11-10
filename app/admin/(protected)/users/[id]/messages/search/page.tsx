import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ChatSearch } from "@/features/chat/components/ChatSearch";
import { loadChatProfile } from "@/features/chat/services/chat-profile";
import { findConversationByUserId } from "@/features/chat/services/chat-queries";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { adminActorKey } from "@/features/contact-aliases/utils/alias-rules";
import { requireAdmin } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";
import { findUserById } from "@/services/users";

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
  const user = await findUserById(Number(id));

  if (!user || !(await canAdminAccessUser(admin.id, user.id))) {
    notFound();
  }
  const conversation = await findConversationByUserId(user.id);
  const profile = conversation
    ? await loadChatProfile(conversation.id, adminActorKey(admin.id))
    : null;

  return (
    <ChatSearch
      viewer={{ role: "admin", adminId: admin.id, peerName: user.name }}
      // Without a conversation there is nothing to find; 0 never exists.
      endpoint={`/api/admin/chat/${conversation?.id ?? 0}/search`}
      paths={chatPaths("admin", user.id)}
      nicknames={profile?.nicknames ?? {}}
    />
  );
};

export default AdminMessagesSearchPage;
