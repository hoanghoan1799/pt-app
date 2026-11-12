import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ScrollToTopButton } from "@/components/common/ScrollToTopButton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { ProfileView } from "@/features/social/components/ProfileView";
import {
  getProfile,
  getProfilePosts,
  getSocialMe,
  profileKey,
} from "@/features/social/services/social-queries";
import { parseProfileKind } from "@/features/social/utils/post-rules";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("pages.profile");

  return { title: t("metaTitle") };
};

const ProfilePage = async ({ params }: PageProps<"/profile/[kind]/[id]">) => {
  await requireUser();
  const t = await getTranslations("pages.profile");

  // Social pages sit behind the terms; the feed shows them.
  if (!(await getSocialMe("user")).termsAccepted) {
    redirect(ROUTES.FEED);
  }
  const { kind: rawKind, id: rawId } = await params;
  const kind = parseProfileKind(rawKind);
  const id = Number(rawId);

  if (!kind || !Number.isSafeInteger(id) || id <= 0) {
    notFound();
  }
  // Missing, and blocked either way, look the same: no such profile (spec M1).
  const card = await getProfile("user", profileKey(kind, id));

  if (!card) {
    notFound();
  }
  const { profile } = card;
  const posts = await getProfilePosts("user", profileKey(kind, id));

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={profile.name}
        backHref={ROUTES.FEED}
      />
      <main
        className={`${PAGE_CONTAINER} pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <ProfileView
          profile={profile}
          mode="user"
          isOwn={card.isOwn}
          posts={posts}
          friendCount={card.friendCount}
          relationship={card.relationship}
          canBlock={card.canBlock}
          canReport={card.canReport}
          composerPrivacy={card.composerPrivacy}
          stats={card.stats}
        />
      </main>
      <ScrollToTopButton aboveTabBar />
    </>
  );
};

export default ProfilePage;
