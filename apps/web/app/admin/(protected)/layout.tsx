import { BackgroundLock } from "@/features/auth/components/BackgroundLock";
import { PresenceHeartbeat } from "@/features/chat/components/PresenceHeartbeat";
import { ChatBubbleHost } from "@/features/chat-bubbles/components/ChatBubbleHost";
import { EmbedBridge } from "@/features/chat-bubbles/components/EmbedBridge";
import { requireAdmin } from "@/services/auth-guard";

// Every page in this group is for signed-in admins only.
const AdminProtectedLayout = async ({ children }: LayoutProps<"/admin">) => {
  const admin = await requireAdmin();

  return (
    <>
      <PresenceHeartbeat role="admin" />
      {admin.hasPasscode && <BackgroundLock />}
      {children}
      <ChatBubbleHost role="admin" />
      <EmbedBridge />
    </>
  );
};

export default AdminProtectedLayout;
