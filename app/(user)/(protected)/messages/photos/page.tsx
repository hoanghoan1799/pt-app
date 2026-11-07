import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import {
  getAvatarUrl,
  listAdminAvatarUrls,
} from "@/features/avatar/services/avatar";
import { PhotoGallery } from "@/features/chat/components/PhotoGallery";
import { loadGalleryForTrainee } from "@/features/chat/services/chat-gallery";
import { findConversationByUserId } from "@/features/chat/services/chat-queries";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { requireUser } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Ảnh đã gửi" };

// The trainee's photo gallery (KAN-160): every photo of the conversation,
// newest first.
const MessagesPhotosPage = async () => {
  const user = await requireUser();
  const conversation = await findConversationByUserId(user.id);
  const [result, adminAvatars, ownAvatar] = await Promise.all([
    loadGalleryForTrainee(conversation?.id ?? null),
    listAdminAvatarUrls(),
    getAvatarUrl("user", user.id),
  ]);
  const paths = chatPaths("user", user.id);
  const avatars: Record<string, string> = Object.fromEntries(
    [...adminAvatars].map(([id, url]) => [`admin:${id}`, url]),
  );

  if (ownAvatar) {
    avatars.user = ownAvatar;
  }

  return (
    <>
      <AppHeader title="Ảnh đã gửi" backHref={paths.info} />
      <main className="mx-auto w-full max-w-lg pb-12">
        <PhotoGallery
          initial={
            result.status === "ok"
              ? result.page
              : { items: [], nextCursor: null }
          }
          endpoint="/api/chat/gallery"
          chatPath={paths.chat}
          avatars={avatars}
        />
      </main>
    </>
  );
};

export default MessagesPhotosPage;
