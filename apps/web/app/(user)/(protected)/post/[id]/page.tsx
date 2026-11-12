import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ScrollToTopButton } from "@/components/common/ScrollToTopButton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { CommentSection } from "@/features/social/components/CommentSection";
import { PostCard } from "@/features/social/components/PostCard";
import {
  getPostView,
  getSocialMe,
  listComments,
} from "@/features/social/services/social-queries";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("social.pages");

  return { title: t("postTitle") };
};

const PostPage = async ({ params }: PageProps<"/post/[id]">) => {
  const t = await getTranslations("social.pages");
  await requireUser();

  if (!(await getSocialMe("user")).termsAccepted) {
    redirect(ROUTES.FEED);
  }
  const id = Number((await params).id);
  // Missing, deleted and invisible posts look the same.
  const [post, comments] = Number.isSafeInteger(id)
    ? await Promise.all([getPostView("user", id), listComments("user", id)])
    : [null, null];

  if (!post || !comments) {
    notFound();
  }
  return (
    <>
      <AppHeader
        eyebrow={t("feedTitle")}
        title={t("postTitle")}
        backHref={ROUTES.FEED}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <PostCard post={post} mode="user" isDetail />
        <CommentSection postId={post.id} mode="user" comments={comments} />
      </main>
      <ScrollToTopButton aboveTabBar />
    </>
  );
};

export default PostPage;
