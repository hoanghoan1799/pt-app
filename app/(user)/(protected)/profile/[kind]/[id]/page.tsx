import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { userActorKey } from "@/features/contact-aliases/utils/alias-rules";
import { ProfileView } from "@/features/social/components/ProfileView";
import { actorOfUser } from "@/features/social/services/post-context";
import { listProfilePosts } from "@/features/social/services/post-queries";
import {
  getPostPrivacyDefault,
  getProfile,
} from "@/features/social/services/profile-queries";
import {
  countFriends,
  getRelationship,
  isBlockedBetween,
} from "@/features/social/services/relationships";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { parseProfileKind } from "@/features/social/utils/post-rules";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("pages.profile");

  return { title: t("metaTitle") };
};

const ProfilePage = async ({ params }: PageProps<"/profile/[kind]/[id]">) => {
  const user = await requireUser();
  const locale = await getLocale();
  const t = await getTranslations("pages.profile");

  // Social pages sit behind the terms; the feed shows them.
  if (!hasAcceptedTerms(user)) {
    redirect(ROUTES.FEED);
  }
  const { kind: rawKind, id: rawId } = await params;
  const kind = parseProfileKind(rawKind);
  const profile = kind
    ? await getProfile(kind, Number(rawId), userActorKey(user.id))
    : null;

  if (!kind || !profile) {
    notFound();
  }
  const isTrainee = kind === "user";
  const isOwn = isTrainee && profile.id === user.id;

  // Blocked either way: the profile does not exist for you (spec M1).
  if (isTrainee && !isOwn && (await isBlockedBetween(user.id, profile.id))) {
    notFound();
  }
  const [posts, friendCount, relationship, composerPrivacy] = await Promise.all(
    [
      listProfilePosts(
        actorOfUser(user),
        { kind, id: profile.id },
        null,
        locale,
      ),
      isTrainee ? countFriends(profile.id) : null,
      isTrainee && !isOwn ? getRelationship(user.id, profile.id) : null,
      isOwn ? getPostPrivacyDefault(user.id) : null,
    ],
  );

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
          isOwn={isOwn}
          posts={posts}
          friendCount={friendCount}
          relationship={
            relationship && relationship !== "self" ? relationship : null
          }
          canBlock={isTrainee && !isOwn}
          canReport={isTrainee && !isOwn}
          composerPrivacy={composerPrivacy}
        />
      </main>
    </>
  );
};

export default ProfilePage;
