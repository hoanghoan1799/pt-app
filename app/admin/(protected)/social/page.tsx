import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { ICON_BUTTON, PAGE_CONTAINER } from "@/constants/styles";
import { NotificationBell } from "@/features/social/components/NotificationBell";
import { PostComposer } from "@/features/social/components/PostComposer";
import { PostList } from "@/features/social/components/PostList";
import { listAdminFeed } from "@/features/social/services/post-queries";
import { countUnreadNotifications } from "@/features/social/services/social-notifications";
import { isSuperAdmin } from "@/services/admin-scope";
import { requireAdmin } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Mạng xã hội" };

const AdminSocialPage = async () => {
  const admin = await requireAdmin();
  const [posts, unreadCount] = await Promise.all([
    listAdminFeed(admin),
    countUnreadNotifications(`admin:${admin.id}`),
  ]);

  return (
    <>
      <AppHeader
        eyebrow={`Admin · ${admin.username}`}
        title="Mạng xã hội"
        backHref={ROUTES.ADMIN}
        actions={
          <>
            {isSuperAdmin(admin) && (
              <Link
                href={ROUTES.ADMIN_SOCIAL_CHATS}
                className={ICON_BUTTON}
                aria-label="Chat học viên"
              >
                <MessageCircle className="size-6" aria-hidden />
              </Link>
            )}
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
        <PostComposer mode="admin" defaultPrivacy="everyone" />
        <PostList
          mode="admin"
          source={{ type: "admin-feed" }}
          initial={posts}
          emptyText="Chưa có bài viết nào."
        />
      </main>
    </>
  );
};

export default AdminSocialPage;
