import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { GroupInfo } from "@/features/chat-groups/components/GroupInfo";
import {
  loadGroupCandidates,
  loadGroupInfo,
} from "@/features/chat-groups/services/group-queries";
import { parseRouteId } from "@/features/chat-groups/utils/group-ids";
import { requireAdmin } from "@/services/auth-guard";
import { getAdminGroupPath } from "@/utils/routes";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("chatGroups.pages");

  return { title: t("infoTitle") };
};

// The group info page: members, and for whoever can manage the controls to
// change the group. Same access rule as the thread (404 for non-members).
const AdminGroupInfoPage = async ({
  params,
}: PageProps<"/admin/messages/groups/[groupId]/info">) => {
  const t = await getTranslations("chatGroups.pages");

  await requireAdmin();
  const groupId = parseRouteId((await params).groupId);
  const info = groupId === null ? null : await loadGroupInfo("admin", groupId);

  if (!info) {
    notFound();
  }
  const { group, viewer, members } = info;
  // The add sheet's people, minus the members (the API leaves them out).
  const candidates =
    viewer.canManage && !group.dissolved
      ? await loadGroupCandidates(group.id)
      : { trainees: [], pts: [] };

  return (
    <>
      <AppHeader
        title={t("infoTitle")}
        backHref={getAdminGroupPath(group.id)}
      />
      <GroupInfo
        group={{
          id: group.id,
          name: group.name,
          avatarUrl: group.avatarUrl,
          managersOnly: group.managersOnly,
          dissolved: group.dissolved,
        }}
        members={members}
        candidates={candidates}
        viewerKey={viewer.key}
        canManage={viewer.canManage}
        isSuperAdmin={viewer.isSuperAdmin}
        initialMuted={viewer.muted}
      />
    </>
  );
};

export default AdminGroupInfoPage;
