import { UserTabBar } from "@/components/layout/UserTabBar";
import { PresenceHeartbeat } from "@/features/chat/components/PresenceHeartbeat";
import { ChatBubbleHost } from "@/features/chat-bubbles/components/ChatBubbleHost";
import { EmbedBridge } from "@/features/chat-bubbles/components/EmbedBridge";
import { InstallPrompt } from "@/features/pwa/components/InstallPrompt";
import { RestrictionBanner } from "@/features/restrictions/components/RestrictionBanner";
import { requireUser } from "@/services/auth-guard";

// Every page in this group is for signed-in users only.
const UserProtectedLayout = async ({ children }: LayoutProps<"/">) => {
  // A suspended trainee never gets here (the API rejects the session), so
  // this is a restriction: the banner shows the level, the end and the reason.
  const { restriction } = await requireUser();

  return (
    <>
      {restriction && <RestrictionBanner restriction={restriction} />}
      {children}
      <PresenceHeartbeat role="user" />
      <InstallPrompt />
      <UserTabBar />
      <ChatBubbleHost role="user" />
      <EmbedBridge />
    </>
  );
};

export default UserProtectedLayout;
