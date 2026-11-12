import "server-only";

import { loadReplyPostViews } from "@/features/social/services/dm-reply-post";
import { loadVisiblePost } from "@/features/social/services/post-access";
import type { SocialActor } from "@/features/social/types/social";

// "Reply to a post" in the coach chat. The post must be one the sender may
// see and the other side wrote: a PT or super admin post for a trainee (the
// conversation is shared by all PTs), a post of this conversation's trainee
// for a PT.
export const canQuotePost = async (
  sender: SocialActor,
  postId: number,
  traineeId: number,
) => {
  const post = await loadVisiblePost(sender, postId);

  if (!post) {
    return false;
  }
  return sender.kind === "user"
    ? post.authorKind === "admin"
    : post.authorKind === "user" && post.authorId === traineeId;
};

// The preview for the bar of a freshly opened chat (`?replyPost=`): null unless
// the viewer may quote that post here.
export const loadCoachReplyPostFor = async (
  viewer: SocialActor,
  postId: number,
  traineeId: number,
) => {
  if (!(await canQuotePost(viewer, postId, traineeId))) {
    return null;
  }
  const view = (await loadReplyPostViews(viewer, [postId])).get(postId);

  return view?.available ? view : null;
};
