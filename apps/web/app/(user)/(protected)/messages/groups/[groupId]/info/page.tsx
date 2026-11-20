import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { GroupMemberInfo } from "@/features/chat-groups/components/GroupMemberInfo";
import { loadGroupInfo } from "@/features/chat-groups/services/group-queries";
import { parseRouteId } from "@/features/chat-groups/utils/group-ids";
import { requireUser } from "@/services/auth-guard";
import { getUserGroupPath } from "@/utils/routes";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("chatGroups.pages");

  return { title: t("infoTitle") };
};

// The trainee's group info page: members with their label, mute and leave.
// No add, remove or rename controls, and no member row opens anything. Same
// 404 rule as the thread.
const UserGroupInfoPage = async ({
  params,
}: PageProps<"/messages/groups/[groupId]/info">) => {
  const t = await getTranslations("chatGroups.pages");

  await requireUser();
  const groupId = parseRouteId((await params).groupId);
  const info = groupId === null ? null : await loadGroupInfo("user", groupId);

  if (!info) {
    notFound();
  }
  const { group, viewer, members } = info;

  return (
    <>
      <AppHeader title={t("infoTitle")} backHref={getUserGroupPath(group.id)} />
      <GroupMemberInfo
        group={{
          id: group.id,
          name: group.name,
          avatarUrl: group.avatarUrl,
          managersOnly: group.managersOnly,
        }}
        members={members}
        viewerKey={viewer.key}
        initialMuted={viewer.muted}
      />
    </>
  );
};

export default UserGroupInfoPage;
