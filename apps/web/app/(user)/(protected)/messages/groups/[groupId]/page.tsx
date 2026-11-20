import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ROUTES } from "@/constants/routes";
import { GroupThread } from "@/features/chat-groups/components/GroupThread";
import { loadGroupThread } from "@/features/chat-groups/services/group-queries";
import { parseRouteId } from "@/features/chat-groups/utils/group-ids";
import {
  groupStateOf,
  toThreadSnapshot,
} from "@/features/chat-groups/utils/group-thread-map";
import { requireUser } from "@/services/auth-guard";
import { getUserGroupInfoPath } from "@/utils/routes";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("chatGroups.pages");

  return { title: t("threadMeta") };
};

// One group conversation for a trainee. A missing group, a dissolved one, a
// group they are not in and one they left all answer the same 404. Reading
// stays open when chat is off, the account is restricted or the group is
// managers-only: the composer turns into a banner instead.
const UserGroupPage = async ({
  params,
}: PageProps<"/messages/groups/[groupId]">) => {
  const user = await requireUser();
  const groupId = parseRouteId((await params).groupId);
  const payload =
    groupId === null ? null : await loadGroupThread("user", groupId);

  if (!payload) {
    notFound();
  }
  const { group, viewer } = payload;

  return (
    <GroupThread
      groupId={group.id}
      groupName={group.name}
      avatarSrc={group.avatarUrl}
      role="user"
      viewerId={user.id}
      viewerKey={viewer.key}
      viewerName={user.name}
      canManage={viewer.canManage}
      canResolveAlert={false}
      initialState={groupStateOf(payload)}
      initial={toThreadSnapshot(payload, viewer.key)}
      backHref={ROUTES.MESSAGES}
      infoHref={getUserGroupInfoPath(group.id)}
    />
  );
};

export default UserGroupPage;
