import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import {
  getAvatarUrl,
  listAdminAvatarUrls,
} from "@/features/avatar/services/avatar";
import { GalleryView } from "@/features/chat/components/GalleryView";
import { loadGalleryForAdmin } from "@/features/chat/services/chat-gallery";
import { findConversationByUserId } from "@/features/chat/services/chat-queries";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { parseGalleryTab } from "@/features/chat/utils/gallery-rules";
import { requireAdmin } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";
import { findUserById } from "@/services/users";

export const metadata: Metadata = { title: "Ảnh, sticker và link" };

// The admin's gallery for one trainee (KAN-160), tab by `?tab=`. A hidden
// trainee is "not found" unless revealed.
const AdminMessagesPhotosPage = async ({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]/messages/photos">) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const tab = parseGalleryTab((await searchParams).tab);
  const user = await findUserById(Number(id));

  if (!user || !(await canAdminAccessUser(admin.id, user.id))) {
    notFound();
  }
  const conversation = await findConversationByUserId(user.id);
  const [result, adminAvatars, traineeAvatar] = await Promise.all([
    conversation
      ? loadGalleryForAdmin(admin.id, conversation.id, undefined, tab)
      : { status: "ok" as const, page: { items: [], nextCursor: null } },
    listAdminAvatarUrls(),
    getAvatarUrl("user", user.id),
  ]);
  const paths = chatPaths("admin", user.id);
  const avatars: Record<string, string> = Object.fromEntries(
    [...adminAvatars].map(([adminId, url]) => [`admin:${adminId}`, url]),
  );

  if (traineeAvatar) {
    avatars.user = traineeAvatar;
  }
  if (result.status !== "ok") {
    notFound();
  }

  return (
    <>
      <AppHeader title="Ảnh, sticker và link" backHref={paths.info} />
      <main className="mx-auto w-full max-w-lg pt-3 pb-12">
        <GalleryView
          tab={tab}
          page={result.page}
          basePath={paths.photos}
          endpoint={`/api/admin/chat/${conversation?.id ?? 0}/gallery`}
          chatPath={paths.chat}
          avatars={avatars}
        />
      </main>
    </>
  );
};

export default AdminMessagesPhotosPage;
