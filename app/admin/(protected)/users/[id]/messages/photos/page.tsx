import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import {
  getAvatarUrl,
  listAdminAvatarUrls,
} from "@/features/avatar/services/avatar";
import { PhotoGallery } from "@/features/chat/components/PhotoGallery";
import { loadGalleryForAdmin } from "@/features/chat/services/chat-gallery";
import { findConversationByUserId } from "@/features/chat/services/chat-queries";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { requireAdmin } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";
import { findUserById } from "@/services/users";

export const metadata: Metadata = { title: "Ảnh đã gửi" };

// The admin's photo gallery for one trainee (KAN-160). A hidden trainee is
// "not found" unless revealed.
const AdminMessagesPhotosPage = async ({
  params,
}: PageProps<"/admin/users/[id]/messages/photos">) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const user = await findUserById(Number(id));

  if (!user || !(await canAdminAccessUser(admin.id, user.id))) {
    notFound();
  }
  const conversation = await findConversationByUserId(user.id);
  const [result, adminAvatars, traineeAvatar] = await Promise.all([
    conversation
      ? loadGalleryForAdmin(admin.id, conversation.id)
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
      <AppHeader title="Ảnh đã gửi" backHref={paths.info} />
      <main className="mx-auto w-full max-w-lg pb-12">
        <PhotoGallery
          initial={result.page}
          endpoint={`/api/admin/chat/${conversation?.id ?? 0}/gallery`}
          chatPath={paths.chat}
          avatars={avatars}
        />
      </main>
    </>
  );
};

export default AdminMessagesPhotosPage;
