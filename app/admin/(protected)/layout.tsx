import { PresenceHeartbeat } from "@/features/chat/components/PresenceHeartbeat";
import { requireAdmin } from "@/services/auth-guard";

// Every page in this group is for signed-in admins only.
const AdminProtectedLayout = async ({ children }: LayoutProps<"/admin">) => {
  await requireAdmin();

  return (
    <>
      <PresenceHeartbeat role="admin" />
      {children}
    </>
  );
};

export default AdminProtectedLayout;
