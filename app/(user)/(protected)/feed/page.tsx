import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { UserHeaderActions } from "@/features/auth/components/UserHeaderActions";
import { NotificationBell } from "@/features/social/components/NotificationBell";
import { PostComposer } from "@/features/social/components/PostComposer";
import { PostList } from "@/features/social/components/PostList";
import { TermsContent } from "@/features/social/components/TermsContent";
import { TermsAcceptButton } from "@/features/social/components/TermsGate";
import { listUserFeed } from "@/features/social/services/post-queries";
import { getPostPrivacyDefault } from "@/features/social/services/profile-queries";
import { countUnreadNotifications } from "@/features/social/services/social-notifications";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { requireUser } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Bảng tin" };

const FeedPage = async () => {
  const user = await requireUser();
  const accepted = hasAcceptedTerms(user);
  const [posts, defaultPrivacy, unreadCount] = accepted
    ? await Promise.all([
        listUserFeed(user.id),
        getPostPrivacyDefault(user.id),
        countUnreadNotifications(`user:${user.id}`),
      ])
    : [null, null, 0];

  return (
    <>
      <AppHeader
        eyebrow="Mạng xã hội"
        title="Bảng tin"
        actions={
          <>
            {accepted && (
              <NotificationBell
                href={ROUTES.NOTIFICATIONS}
                unreadCount={unreadCount}
              />
            )}
            {accepted && (
              <Link
                href={ROUTES.FRIENDS}
                aria-label="Bạn bè"
                className="inline-flex size-11 items-center justify-center"
              >
                <Users className="size-6" aria-hidden />
              </Link>
            )}
            <UserHeaderActions />
          </>
        }
      />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        {posts && defaultPrivacy ? (
          <>
            <PostComposer mode="user" defaultPrivacy={defaultPrivacy} />
            <PostList
              mode="user"
              source={{ type: "feed" }}
              initial={posts}
              emptyText="Chưa có bài viết nào. Hãy đăng bài đầu tiên!"
            />
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              Hãy đọc và đồng ý điều khoản để dùng Bảng tin.
            </p>
            <TermsContent />
            <TermsAcceptButton />
          </>
        )}
      </main>
    </>
  );
};

export default FeedPage;
