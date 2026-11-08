import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { ROUTES } from "@/constants/routes";
import { CARD, PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { CreatePtForm } from "@/features/pts/components/CreatePtForm";
import { VerifiedToggle } from "@/features/pts/components/VerifiedToggle";
import { listAdminAccounts } from "@/features/pts/services/pt-queries";
import { requireSuperAdmin } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Quản lý PT" };

const AdminPtsPage = async () => {
  await requireSuperAdmin();

  const accounts = await listAdminAccounts();

  return (
    <>
      <AppHeader eyebrow="Admin" title="Quản lý PT" backHref={ROUTES.ADMIN} />
      <main
        className={`${PAGE_CONTAINER} space-y-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <section className="space-y-2">
          <h2 className={SECTION_TITLE}>Tài khoản admin · {accounts.length}</h2>
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className={`${CARD} flex items-center gap-3 p-3`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-fg">
                    {account.username}
                    {account.verified && <VerifiedBadge className="ml-1" />}
                  </p>
                  <p className="text-sm text-muted">
                    {account.role === "pt" ? "PT" : "Super admin"}
                  </p>
                </div>
                <VerifiedToggle
                  adminId={account.id}
                  verified={account.verified}
                />
              </li>
            ))}
          </ul>
        </section>
        <section className="space-y-3">
          <h2 className={SECTION_TITLE}>Thêm PT</h2>
          <div className={`${CARD} p-4`}>
            <CreatePtForm />
          </div>
        </section>
      </main>
    </>
  );
};

export default AdminPtsPage;
