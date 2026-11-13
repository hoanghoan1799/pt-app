import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ScrollToTopButton } from "@/components/common/ScrollToTopButton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { UserHeaderActions } from "@/features/auth/components/UserHeaderActions";
import { getOwnAvatarUrl } from "@/features/avatar/services/own-avatar";
import { NotificationBell } from "@/features/social/components/NotificationBell";
import { PostComposer } from "@/features/social/components/PostComposer";
import { PostList } from "@/features/social/components/PostList";
import { TermsContent } from "@/features/social/components/TermsContent";
import { TermsAcceptButton } from "@/features/social/components/TermsGate";
import {
  getFeedPage,
  getSocialMe,
} from "@/features/social/services/social-queries";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("social.pages");

  return { title: t("feedTitle") };
};

const FeedPage = async () => {
  const t = await getTranslations("social.pages");
  const user = await requireUser();
  const me = await getSocialMe("user");
  const accepted = me.termsAccepted;
  const [posts, avatarUrl] = accepted
    ? await Promise.all([getFeedPage("user"), getOwnAvatarUrl("user")])
    : [null, null];
  const defaultPrivacy = me.postPrivacyDefault;
  const unreadCount = me.unreadNotifications;

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
        {posts ? (
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
