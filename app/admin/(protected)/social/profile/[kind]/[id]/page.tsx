import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { ProfileView } from "@/features/social/components/ProfileView";
import { actorOfAdmin } from "@/features/social/services/post-context";
import { listProfilePosts } from "@/features/social/services/post-queries";
import { getProfile } from "@/features/social/services/profile-queries";
import { countFriends } from "@/features/social/services/relationships";
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
  const admin =
    kind === "user" ? await requireAdminForUser(id) : await requireAdmin();
  const locale = await getLocale();
  const profile = await getProfile(kind, id);

  if (!profile) {
    notFound();
  }
  const isOwn = kind === "admin" && admin.id === id;
  const [posts, friendCount] = await Promise.all([
    listProfilePosts(actorOfAdmin(admin), { kind, id }, null, locale),
    kind === "user" ? countFriends(id) : null,
  ]);

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
          isOwn={isOwn}
          posts={posts}
          friendCount={friendCount}
          canReport={kind === "user"}
          composerPrivacy={isOwn ? "everyone" : null}
        />
      </main>
    </>
  );
};

export default AdminProfilePage;
