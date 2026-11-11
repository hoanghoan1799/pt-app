import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { ScrollToTopButton } from "@/components/common/ScrollToTopButton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { UserHeaderActions } from "@/features/auth/components/UserHeaderActions";
import { getAvatarUrl } from "@/features/avatar/services/avatar";
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

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("social.pages");

  return { title: t("feedTitle") };
};

const FeedPage = async () => {
  const t = await getTranslations("social.pages");
  const user = await requireUser();
  const locale = await getLocale();
  const accepted = hasAcceptedTerms(user);
  const [posts, defaultPrivacy, unreadCount, avatarUrl] = accepted
    ? await Promise.all([
        listUserFeed(user.id, null, undefined, locale),
        getPostPrivacyDefault(user.id),
        countUnreadNotifications(`user:${user.id}`),
        getAvatarUrl("user", user.id),
      ])
    : [null, null, 0, null];

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={t("feedTitle")}
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
                aria-label={t("friendsLink")}
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
            <PostComposer
              mode="user"
              defaultPrivacy={defaultPrivacy}
              viewerName={user.name}
              viewerAvatarUrl={avatarUrl}
            />
            <PostList
              mode="user"
              source={{ type: "feed" }}
              initial={posts}
              emptyText={t("feedEmpty")}
            />
          </>
        ) : (
          <>
            <p className="text-sm text-muted">{t("feedTerms")}</p>
            <TermsContent />
            <TermsAcceptButton />
          </>
        )}
      </main>
      <ScrollToTopButton aboveTabBar />
    </>
  );
};

export default FeedPage;
