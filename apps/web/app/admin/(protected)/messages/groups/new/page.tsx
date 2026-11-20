import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { CreateGroupForm } from "@/features/chat-groups/components/CreateGroupForm";
import { loadGroupCandidates } from "@/features/chat-groups/services/group-queries";
import { requireAdmin } from "@/services/auth-guard";
import { isSuperAdmin } from "@/utils/admin-role";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("chatGroups.pages");

  return { title: t("createTitle") };
};

// Create a group: a super admin picks any trainee and PT, a PT only their own
// trainees. The picker list is scoped by the API and again by the create.
const AdminNewGroupPage = async () => {
  const t = await getTranslations("chatGroups.pages");
  const admin = await requireAdmin();
  const candidates = await loadGroupCandidates();

  return (
    <>
      <AppHeader title={t("createTitle")} backHref={ROUTES.ADMIN_MESSAGES} />
      <CreateGroupForm
        candidates={candidates}
        isSuperAdmin={isSuperAdmin(admin)}
      />
    </>
  );
};

export default AdminNewGroupPage;
