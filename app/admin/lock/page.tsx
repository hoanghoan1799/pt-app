import { requireAdminSession } from "@/services/auth-guard";

// Placeholder so the lock redirect has a target. The passcode screen arrives
// with KAN-162; until then no UI sets a passcode, so nobody lands here.
const AdminLockPage = async () => {
  await requireAdminSession();

  return <main className="p-6 text-center">Ứng dụng đang bị khoá</main>;
};

export default AdminLockPage;
