import { requireAdmin } from "@/services/auth-guard";

// Every page in this group is for signed-in admins only.
const AdminProtectedLayout = async ({ children }: LayoutProps<"/admin">) => {
  await requireAdmin();

  return children;
};

export default AdminProtectedLayout;
