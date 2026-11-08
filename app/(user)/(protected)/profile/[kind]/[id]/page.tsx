import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { ProfileView } from "@/features/social/components/ProfileView";
import { actorOfUser } from "@/features/social/services/post-context";
import { listProfilePosts } from "@/features/social/services/post-queries";
import { getProfile } from "@/features/social/services/profile-queries";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { parseProfileKind } from "@/features/social/utils/post-rules";
import { requireUser } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Trang cá nhân" };

const ProfilePage = async ({ params }: PageProps<"/profile/[kind]/[id]">) => {
  const user = await requireUser();

  // Social pages sit behind the terms; the feed shows them.
  if (!hasAcceptedTerms(user)) {
    redirect(ROUTES.FEED);
  }
  const { kind: rawKind, id: rawId } = await params;
  const kind = parseProfileKind(rawKind);
  const profile = kind ? await getProfile(kind, Number(rawId)) : null;

  if (!kind || !profile) {
    notFound();
  }
  const posts = await listProfilePosts(actorOfUser(user), {
    kind,
    id: profile.id,
  });

  return (
    <>
      <AppHeader
        eyebrow="Trang cá nhân"
        title={profile.name}
        backHref={ROUTES.FEED}
      />
      <main
        className={`${PAGE_CONTAINER} pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <ProfileView
          profile={profile}
          mode="user"
          isOwn={kind === "user" && profile.id === user.id}
          posts={posts}
        />
      </main>
    </>
  );
};

export default ProfilePage;
