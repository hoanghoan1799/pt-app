import { UserTabBar } from "@/components/layout/UserTabBar";
import { requireUser } from "@/services/auth-guard";

// Every page in this group is for signed-in users only.
const UserProtectedLayout = async ({ children }: LayoutProps<"/">) => {
  await requireUser();

  return (
    <>
      {children}
      <UserTabBar />
    </>
  );
};

export default UserProtectedLayout;
