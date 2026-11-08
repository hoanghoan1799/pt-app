import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { ROUTES } from "@/constants/routes";
import { CARD, PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { CreatePtForm } from "@/features/pts/components/CreatePtForm";
import { PtAssignSelect } from "@/features/pts/components/PtAssignSelect";
import { VerifiedToggle } from "@/features/pts/components/VerifiedToggle";
import {
  listAdminAccounts,
  listPtOptions,
  listWorkspaceTrainees,
} from "@/features/pts/services/pt-queries";
import { requireSuperAdmin } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Quản lý PT" };

const AdminPtsPage = async () => {
  await requireSuperAdmin();

  const [accounts, ptOptions, trainees] = await Promise.all([
    listAdminAccounts(),
    listPtOptions(),
    listWorkspaceTrainees(),
  ]);
  const traineesOf = (ptId: number | null) =>
    trainees.filter((trainee) => trainee.ptAdminId === ptId);
  const unassigned = traineesOf(null);

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
                    {account.role === "pt"
                      ? `PT · ${account.traineeCount} học viên`
                      : "Super admin"}
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
        <section className="space-y-2">
          <h2 className={SECTION_TITLE}>Học viên theo PT</h2>
          {[
            ...accounts
              .filter((account) => account.role === "pt")
              .map((account) => ({
                key: account.id,
                title: account.username,
                members: traineesOf(account.id),
              })),
            { key: "none", title: "Chưa có PT", members: unassigned },
          ].map((group) => (
            <details key={group.key} className={`${CARD} p-3`}>
              <summary className="cursor-pointer font-semibold text-fg">
                {group.title} · {group.members.length} học viên
              </summary>
              {group.members.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Chưa có học viên</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {group.members.map((trainee) => (
                    <li key={trainee.id}>
                      <PtAssignSelect
                        userId={trainee.id}
                        currentPtId={trainee.ptAdminId}
                        options={ptOptions}
                        label={trainee.name}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ))}
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
