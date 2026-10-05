import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { CreateMemberForm } from "@/features/members/components/CreateMemberForm";
import { MemberList } from "@/features/members/components/MemberList";
import { listMembers } from "@/features/members/services/member-queries";
import { requireAdmin } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Quản lý user" };

const AdminPage = async () => {
  const admin = await requireAdmin();

  const members = await listMembers();

  return (
    <>
      <AppHeader
        eyebrow={`Admin · ${admin.username}`}
        title="User của bạn"
        actions={<LogoutButton role="admin" />}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <section className="space-y-2">
          <h2 className={SECTION_TITLE}>Thêm user</h2>
          <CreateMemberForm />
        </section>
        <section className="space-y-2">
          <h2 className={SECTION_TITLE}>Danh sách · {members.length}</h2>
          <MemberList members={members} />
        </section>
      </main>
    </>
  );
};

export default AdminPage;
