import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { GalleryView } from "@/features/chat/components/GalleryView";
import { loadGalleryForAdmin } from "@/features/chat/services/chat-gallery";
import { findTraineeChatHeader } from "@/features/chat/services/chat-queries";
import { listAdminAvatarUrls } from "@/features/chat/services/chat-team";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { parseGalleryTab } from "@/features/chat/utils/gallery-rules";
import { requireAdmin } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("adminPages.messagesPhotos");

  return { title: t("metaTitle") };
};

// The admin's gallery for one trainee (KAN-160), tab by `?tab=`. A hidden
// trainee is "not found" unless revealed.
const AdminMessagesPhotosPage = async ({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]/messages/photos">) => {
  await requireAdmin();
  const t = await getTranslations("adminPages.messagesPhotos");
  const { id } = await params;
  const tab = parseGalleryTab((await searchParams).tab);
  const userId = Number(id);
  const header = Number.isSafeInteger(userId)
    ? await findTraineeChatHeader(userId)
    : null;

  if (!header) {
    notFound();
  }
  const conversationId = header.conversationId;
  const traineeAvatar = header.avatarUrl;
  const [result, adminAvatars] = await Promise.all([
    conversationId
      ? loadGalleryForAdmin(conversationId, undefined, tab)
      : { status: "ok" as const, page: { items: [], nextCursor: null } },
    listAdminAvatarUrls("admin"),
  ]);
  const paths = chatPaths("admin", header.userId);
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
      <AppHeader title={t("title")} backHref={paths.info} />
      <main className="mx-auto w-full max-w-lg pt-3 pb-12">
        <GalleryView
          tab={tab}
          page={result.page}
          basePath={paths.photos}
          endpoint={`/api/admin/chat/${conversationId ?? 0}/gallery`}
          chatPath={paths.chat}
          avatars={avatars}
        />
      </main>
    </>
  );
};

export default AdminMessagesPhotosPage;
