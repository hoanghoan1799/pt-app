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
import { requireAdmin } from "@/services/auth-guard";
import { getAdminGroupInfoPath } from "@/utils/routes";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("chatGroups.pages");

  return { title: t("threadMeta") };
};

// One group conversation for an admin. A missing group, a PT who is not a
// member and a left PT all get the same 404; a super admin can still open a
// dissolved group, read-only.
const AdminGroupPage = async ({
  params,
}: PageProps<"/admin/messages/groups/[groupId]">) => {
  const admin = await requireAdmin();
  const groupId = parseRouteId((await params).groupId);
  const payload =
    groupId === null ? null : await loadGroupThread("admin", groupId);

  if (!payload) {
    notFound();
  }
  const { group, viewer } = payload;

  return (
    <GroupThread
      groupId={group.id}
      role="admin"
      viewerId={admin.id}
      viewerKey={viewer.key}
      viewerName={admin.username}
      initialState={groupStateOf(payload)}
      initial={toThreadSnapshot(payload, viewer.key)}
      backHref={ROUTES.ADMIN_MESSAGES}
      infoHref={getAdminGroupInfoPath(group.id)}
    />
  );
};

export default AdminGroupPage;
