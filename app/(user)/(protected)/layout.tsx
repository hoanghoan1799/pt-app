import { requireUser } from "@/services/auth-guard";

// Every page in this group is for signed-in users only.
const UserProtectedLayout = async ({ children }: LayoutProps<"/">) => {
  await requireUser();

  return children;
};

export default UserProtectedLayout;
