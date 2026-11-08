import type { Metadata } from "next";
import Link from "next/link";

import { Avatar } from "@/components/common/Avatar";
import { AppHeader } from "@/components/layout/AppHeader";
import { PAGE_CONTAINER } from "@/constants/styles";
import { UserHeaderActions } from "@/features/auth/components/UserHeaderActions";
import { getAvatarUrl } from "@/features/avatar/services/avatar";
import { PostComposer } from "@/features/social/components/PostComposer";
import { PostList } from "@/features/social/components/PostList";
import { TermsContent } from "@/features/social/components/TermsContent";
import { TermsAcceptButton } from "@/features/social/components/TermsGate";
import { listUserFeed } from "@/features/social/services/post-queries";
import { getPostPrivacyDefault } from "@/features/social/services/profile-queries";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { profilePath } from "@/features/social/utils/post-rules";
import { requireUser } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Bảng tin" };

const FeedPage = async () => {
  const user = await requireUser();
  const accepted = hasAcceptedTerms(user);
  const [avatarUrl, posts, defaultPrivacy] = accepted
    ? await Promise.all([
        getAvatarUrl("user", user.id),
        listUserFeed(user.id),
        getPostPrivacyDefault(user.id),
      ])
    : [null, null, null];

  return (
    <>
      <AppHeader
        eyebrow="Mạng xã hội"
        title="Bảng tin"
        actions={
          <>
            {accepted && (
              <Link
                href={profilePath("user", user.id)}
                aria-label="Trang cá nhân"
                className="inline-flex size-11 items-center justify-center"
              >
                <Avatar
                  name={user.name}
                  src={avatarUrl}
                  className="size-8 text-xs"
                />
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
