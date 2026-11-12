import "server-only";

import { webizeUrls } from "@/features/chat/utils/api-urls";
import type { DmReplyPostView } from "@/features/social/types/dm";
import { runApi } from "@/services/api/call";

// "Reply to a post" in the coach chat. The post must be one the viewer may see
// and the other side wrote: a PT or super admin post for a trainee (the
// conversation is shared by all PTs), a post of this conversation's trainee
// for a PT. The API refuses a post the viewer cannot see (404). When the
// message is sent, the API checks the same rule again.
export const loadCoachReplyPostFor = async (
  viewer: "user" | "admin",
  postId: number,
  traineeId: number,
): Promise<Extract<DmReplyPostView, { available: true }> | null> => {
  const outcome = await runApi(viewer, (api) =>
    api.GET("/v1/social/posts/{id}", {
      params: { path: { id: String(postId) } },
    }),
  );

  if (!outcome.ok) {
    return null;
  }
  const post = webizeUrls(outcome.data);
  const quotable =
    viewer === "user"
      ? post.authorKind === "admin"
      : post.authorKind === "user" && post.authorId === traineeId;

  return quotable
    ? {
        id: post.id,
        available: true,
        authorName: post.authorName,
        authorAvatarUrl: post.authorAvatarUrl,
        caption: post.caption,
        photo: post.photo
          ? {
              url: post.photo.url,
              width: post.photo.width,
              height: post.photo.height,
            }
          : null,
      }
    : null;
};
