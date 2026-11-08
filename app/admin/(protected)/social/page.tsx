import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { PostComposer } from "@/features/social/components/PostComposer";
import { PostList } from "@/features/social/components/PostList";
import { listAdminFeed } from "@/features/social/services/post-queries";
import { requireAdmin } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Mạng xã hội" };

const AdminSocialPage = async () => {
  const admin = await requireAdmin();
  const posts = await listAdminFeed(admin);

  return (
    <>
      <AppHeader
        eyebrow={`Admin · ${admin.username}`}
        title="Mạng xã hội"
        backHref={ROUTES.ADMIN}
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
