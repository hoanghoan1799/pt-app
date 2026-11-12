import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import type {
  ChatPostQuote,
  ChatPostQuoteReader,
} from "../chat/post-quote.port.js";
import { SocialAccountQueries } from "./accounts.queries.js";
import { socialPhotoUrl } from "./mappers.js";
import { PostAccess } from "./post-access.service.js";
import { keyOf, toSocialActor } from "./social-actor.js";

// The Social side of the CHAT_POST_QUOTES port: "reply to a post" in the coach
// chat and the quoted-post previews of a thread. The web quoted posts, so the
// chat refuses nothing it used to accept.
@Injectable()
export class SocialPostQuotes implements ChatPostQuoteReader {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: PostAccess,
    private readonly accounts: SocialAccountQueries,
  ) {}

  // A post the sender may see and the other side wrote: a PT or super admin
  // post for a trainee (the conversation is shared by all PTs), a post of this
  // conversation's trainee for a PT.
  async canQuote(sender: AuthActor, postId: number, traineeId: number) {
    const viewer = toSocialActor(sender);
    const post = await this.access.loadVisiblePost(viewer, postId);

    if (!post) {
      return false;
    }
    return viewer.kind === "user"
      ? post.authorKind === "admin"
      : post.authorKind === "user" && post.authorId === traineeId;
  }

  // Computed per viewer: a post the viewer may no longer see (deleted, privacy
  // changed, block) comes back as `available: false` and nothing else.
  async views(viewer: AuthActor, postIds: readonly number[]) {
    const social = toSocialActor(viewer);
    const result = new Map<number, ChatPostQuote>();
    const ids = [...new Set(postIds)];
    const posts = await Promise.all(
      ids.map((id) => this.access.loadVisiblePost(social, id)),
    );
    const authorKeys = posts.flatMap((post) =>
      post ? [keyOf({ kind: post.authorKind, id: post.authorId })] : [],
    );
    const photoIds = posts.flatMap((post) =>
      post?.photoId == null ? [] : [post.photoId],
    );
    const [authors, photoRows] = await Promise.all([
      this.accounts.loadAccounts(authorKeys, keyOf(social)),
      photoIds.length === 0
        ? []
        : (this.dataSource.query(
            `SELECT id, width, height FROM social_post_photos WHERE id = ANY($1::int[])`,
            [photoIds],
          ) as Promise<{ id: number; width: number; height: number }[]>),
    ]);
    const photos = new Map(photoRows.map((row) => [row.id, row]));

    ids.forEach((id, index) => {
      const post = posts[index];
      const author = post
        ? authors.get(keyOf({ kind: post.authorKind, id: post.authorId }))
        : undefined;
      const photo =
        post?.photoId == null ? undefined : photos.get(post.photoId);

      result.set(
        id,
        post && author
          ? {
              id,
              available: true,
              authorName: author.name,
              authorAvatarUrl: author.avatarUrl,
              caption: post.caption ?? "",
              photo:
                post.photoId !== null && photo
                  ? {
                      url: socialPhotoUrl(post.photoId),
                      width: photo.width,
                      height: photo.height,
                    }
                  : null,
            }
          : { id, available: false },
      );
    });
    return result;
  }
}
