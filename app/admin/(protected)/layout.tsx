import { BackgroundLock } from "@/features/auth/components/BackgroundLock";
import { PresenceHeartbeat } from "@/features/chat/components/PresenceHeartbeat";
import { requireAdmin } from "@/services/auth-guard";

// Every page in this group is for signed-in admins only.
const AdminProtectedLayout = async ({ children }: LayoutProps<"/admin">) => {
  const admin = await requireAdmin();

  return (
    <>
      <PresenceHeartbeat role="admin" />
      {admin.hasPasscode && <BackgroundLock />}
      {children}
    </>
  );
};

export default AdminProtectedLayout;
