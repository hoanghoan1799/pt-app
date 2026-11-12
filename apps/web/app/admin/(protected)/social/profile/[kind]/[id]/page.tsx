import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ScrollToTopButton } from "@/components/common/ScrollToTopButton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { ProfileView } from "@/features/social/components/ProfileView";
import {
  getProfile,
  getProfilePosts,
  profileKey,
} from "@/features/social/services/social-queries";
import { parseProfileKind } from "@/features/social/utils/post-rules";
import { requireAdminForUser } from "@/services/admin-access";
import { requireAdmin } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("social.adminPages");

  return { title: t("profileTitle") };
};

const AdminProfilePage = async ({
  params,
}: PageProps<"/admin/social/profile/[kind]/[id]">) => {
  const t = await getTranslations("social.adminPages");
  const { kind: rawKind, id: rawId } = await params;
  const kind = parseProfileKind(rawKind);
  const id = Number(rawId);

  if (!kind || !Number.isSafeInteger(id)) {
    notFound();
  }
  // A trainee only for admins who may work with them (scope, hidden).
  if (kind === "user") {
    await requireAdminForUser(id);
  } else {
    await requireAdmin();
  }
  const card = await getProfile("admin", profileKey(kind, id));

  if (!card) {
    notFound();
  }
  const { profile } = card;
  const posts = await getProfilePosts("admin", profileKey(kind, id));

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={profile.name}
        backHref={ROUTES.ADMIN_SOCIAL}
      />
      <main
        className={`${PAGE_CONTAINER} pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <ProfileView
          profile={profile}
          mode="admin"
          isOwn={card.isOwn}
          posts={posts}
          friendCount={card.friendCount}
          stats={card.stats}
          canReport={card.canReport}
          composerPrivacy={card.composerPrivacy}
        />
      </main>
      <ScrollToTopButton />
    </>
  );
};

export default AdminProfilePage;
