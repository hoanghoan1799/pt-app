import { UserTabBar } from "@/components/layout/UserTabBar";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import { findConversationByUserId } from "@/features/chat/services/chat-queries";
import { InstallPrompt } from "@/features/pwa/components/InstallPrompt";
import { requireUser } from "@/services/auth-guard";

// Every page in this group is for signed-in users only.
const UserProtectedLayout = async ({ children }: LayoutProps<"/">) => {
  const user = await requireUser();
  // The Nhắn tin tab: chat on, or old messages left to read after a lock.
  const showMessages =
    isChatEnabled(user) ||
    (await findConversationByUserId(user.id))?.lastMessageId != null;

  return (
    <>
      {children}
      <InstallPrompt />
      <UserTabBar showMessages={showMessages} />
    </>
  );
};

export default UserProtectedLayout;
