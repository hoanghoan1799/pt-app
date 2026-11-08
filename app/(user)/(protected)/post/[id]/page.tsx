import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { CommentSection } from "@/features/social/components/CommentSection";
import { PostCard } from "@/features/social/components/PostCard";
import { listComments } from "@/features/social/services/engagement-queries";
import { actorOfUser } from "@/features/social/services/post-context";
import { getPostView } from "@/features/social/services/post-queries";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { requireUser } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Bài viết" };

const PostPage = async ({ params }: PageProps<"/post/[id]">) => {
  const user = await requireUser();

  if (!hasAcceptedTerms(user)) {
    redirect(ROUTES.FEED);
  }
  const id = Number((await params).id);
  const actor = actorOfUser(user);
  // Missing, deleted and invisible posts look the same.
  const [post, comments] = Number.isSafeInteger(id)
    ? await Promise.all([
        getPostView(actor, id),
        listComments(actor, id, "user"),
      ])
    : [null, null];

  if (!post || !comments) {
    notFound();
  }
  return (
    <>
      <AppHeader eyebrow="Bảng tin" title="Bài viết" backHref={ROUTES.FEED} />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <PostCard post={post} mode="user" isDetail />
        <CommentSection postId={post.id} mode="user" comments={comments} />
      </main>
    </>
  );
};

export default PostPage;
