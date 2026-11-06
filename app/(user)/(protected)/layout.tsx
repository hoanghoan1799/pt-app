import { UserTabBar } from "@/components/layout/UserTabBar";
import { PresenceHeartbeat } from "@/features/chat/components/PresenceHeartbeat";
import { InstallPrompt } from "@/features/pwa/components/InstallPrompt";
import { requireUser } from "@/services/auth-guard";

// Every page in this group is for signed-in users only.
const UserProtectedLayout = async ({ children }: LayoutProps<"/">) => {
  await requireUser();

  return (
    <>
      {children}
      <PresenceHeartbeat role="user" />
      <InstallPrompt />
      <UserTabBar />
    </>
  );
};

export default UserProtectedLayout;
