import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { CommentSection } from "@/features/social/components/CommentSection";
import { PostCard } from "@/features/social/components/PostCard";
import { listComments } from "@/features/social/services/engagement-queries";
import { actorOfAdmin } from "@/features/social/services/post-context";
import { getPostView } from "@/features/social/services/post-queries";
import { requireAdmin } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("social.adminPages");

  return { title: t("postTitle") };
};

const AdminPostPage = async ({
  params,
}: PageProps<"/admin/social/post/[id]">) => {
  const t = await getTranslations("social.adminPages");
  const admin = await requireAdmin();
  const locale = await getLocale();
  const id = Number((await params).id);
  const actor = actorOfAdmin(admin);
  const [post, comments] = Number.isSafeInteger(id)
    ? await Promise.all([
        getPostView(actor, id, locale),
        listComments(actor, id, "admin"),
      ])
    : [null, null];

  if (!post || !comments) {
    notFound();
  }
  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={t("postTitle")}
        backHref={ROUTES.ADMIN_SOCIAL}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <PostCard post={post} mode="admin" isDetail />
        <CommentSection postId={post.id} mode="admin" comments={comments} />
      </main>
    </>
  );
};

export default AdminPostPage;
