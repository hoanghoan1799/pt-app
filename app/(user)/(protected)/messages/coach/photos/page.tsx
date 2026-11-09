import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import {
  getAvatarUrl,
  listAdminAvatarUrls,
} from "@/features/avatar/services/avatar";
import { GalleryView } from "@/features/chat/components/GalleryView";
import { loadGalleryForTrainee } from "@/features/chat/services/chat-gallery";
import { findConversationByUserId } from "@/features/chat/services/chat-queries";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { parseGalleryTab } from "@/features/chat/utils/gallery-rules";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("chat.pages");

  return { title: t("photosTitle") };
};

// The trainee's gallery (KAN-160): the photos, stickers or links of the
// conversation by `?tab=`, newest first.
const MessagesPhotosPage = async ({
  searchParams,
}: PageProps<"/messages/coach/photos">) => {
  const t = await getTranslations("chat.pages");
  const user = await requireUser();
  const locale = await getLocale();
  const tab = parseGalleryTab((await searchParams).tab);
  const conversation = await findConversationByUserId(user.id);
  const [result, adminAvatars, ownAvatar] = await Promise.all([
    loadGalleryForTrainee(conversation?.id ?? null, undefined, tab, locale),
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
      <AppHeader title={t("photosTitle")} backHref={paths.info} />
      <main className="mx-auto w-full max-w-lg pt-3 pb-12">
        <GalleryView
          tab={tab}
          page={
            result.status === "ok"
              ? result.page
              : { items: [], nextCursor: null }
          }
          basePath={paths.photos}
          endpoint="/api/chat/gallery"
          chatPath={paths.chat}
          avatars={avatars}
        />
      </main>
    </>
  );
};

export default MessagesPhotosPage;
