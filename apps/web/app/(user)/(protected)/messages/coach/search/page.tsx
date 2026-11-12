import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ChatSearch } from "@/features/chat/components/ChatSearch";
import { loadMyChatState } from "@/features/chat/services/chat-queries";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("chat.pages");

  return { title: t("searchTitle") };
};

// The trainee's message search (KAN-160): only their own conversation.
const MessagesSearchPage = async () => {
  const user = await requireUser();
  const { profile } = await loadMyChatState();

  return (
    <ChatSearch
      viewer={{ role: "user" }}
      endpoint="/api/chat/search"
      paths={chatPaths("user", user.id)}
      nicknames={profile.nicknames}
    />
  );
};

export default MessagesSearchPage;
