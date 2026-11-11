import { MessageCircle, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { ScrollToTopButton } from "@/components/common/ScrollToTopButton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { ICON_BUTTON, PAGE_CONTAINER } from "@/constants/styles";
import { getAvatarUrl } from "@/features/avatar/services/avatar";
import { NotificationBell } from "@/features/social/components/NotificationBell";
import { PostComposer } from "@/features/social/components/PostComposer";
import { PostList } from "@/features/social/components/PostList";
import { listAdminFeed } from "@/features/social/services/post-queries";
import { countUnreadNotifications } from "@/features/social/services/social-notifications";
import { adminProfilePath } from "@/features/social/utils/post-rules";
import { isSuperAdmin } from "@/services/admin-scope";
import { requireAdmin } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("social.adminPages");

  return { title: t("socialTitle") };
};

const AdminSocialPage = async () => {
  const t = await getTranslations("social.adminPages");
  const admin = await requireAdmin();
  const locale = await getLocale();
  const [posts, unreadCount, avatarUrl] = await Promise.all([
    listAdminFeed(admin, null, locale),
    countUnreadNotifications(`admin:${admin.id}`),
    getAvatarUrl("admin", admin.id),
  ]);

  return (
    <>
      <AppHeader
        eyebrow={t("adminEyebrow", { name: admin.username })}
        title={t("socialTitle")}
        backHref={ROUTES.ADMIN}
        actions={
          <>
            {isSuperAdmin(admin) && (
              <Link
                href={ROUTES.ADMIN_SOCIAL_CHATS}
                className={ICON_BUTTON}
                aria-label={t("chatsLink")}
              >
                <MessageCircle className="size-6" aria-hidden />
              </Link>
            )}
            <Link
              href={adminProfilePath("admin", admin.id)}
              className={ICON_BUTTON}
              aria-label={t("myProfileLink")}
            >
              <UserRound className="size-6" aria-hidden />
            </Link>
            <NotificationBell
              href={ROUTES.ADMIN_SOCIAL_NOTIFICATIONS}
              unreadCount={unreadCount}
            />
          </>
        }
      />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <PostComposer
          mode="admin"
          defaultPrivacy="everyone"
          viewerName={admin.username}
          viewerAvatarUrl={avatarUrl}
        />
        <PostList
          mode="admin"
          source={{ type: "admin-feed" }}
          initial={posts}
          emptyText={t("feedEmpty")}
        />
      </main>
      <ScrollToTopButton />
    </>
  );
};

export default AdminSocialPage;
