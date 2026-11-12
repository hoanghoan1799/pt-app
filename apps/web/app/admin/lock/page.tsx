import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { PasscodeLock } from "@/features/auth/components/PasscodeLock";
import { safeNextPath } from "@/features/auth/utils/lock-redirect";
import { isAdminLocked } from "@/services/admin-lock";
import { requireAdminSession } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";

// Lock-exempt guard: a locked admin is exactly who lands here. An admin who
// is not locked (or has no passcode) has nothing to do here.
const AdminLockPage = async ({ searchParams }: PageProps<"/admin/lock">) => {
  const admin = await requireAdminSession();
  const query = await searchParams;

  if (!(await isAdminLocked(admin))) {
    redirect(ROUTES.ADMIN);
  }
  return <PasscodeLock nextPath={safeNextPath(readSearchParam(query.next))} />;
};

export default AdminLockPage;
