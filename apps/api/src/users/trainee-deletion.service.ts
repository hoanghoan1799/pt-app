import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { userActorKey } from "@pt/contracts";
import { DataSource, In } from "typeorm";

import { ChatCustomSticker } from "../database/entities/chat-custom-sticker.entity.js";
import { ContactAlias } from "../database/entities/contact-alias.entity.js";
import { PushSubscription } from "../database/entities/push-subscription.entity.js";
import { SocialComment } from "../database/entities/social-comment.entity.js";
import { SocialNotification } from "../database/entities/social-notification.entity.js";
import { SocialPost } from "../database/entities/social-post.entity.js";
import { SocialPostPhoto } from "../database/entities/social-post-photo.entity.js";
import { SocialReaction } from "../database/entities/social-reaction.entity.js";
import { SocialReport } from "../database/entities/social-report.entity.js";
import { User } from "../database/entities/user.entity.js";

// Deleting a trainee. Everything linked to the user row by a foreign key
// (hidden-trainee rows, chat conversations with their messages, reads,
// colours, nicknames, photos, workouts, sets, completions, nutrition, meal
// plans, logs and marks, friendships, blocks, DMs, sessions) goes with it
// through ON DELETE CASCADE. What is keyed by text ("user:<id>", owner kind +
// id) has no foreign key, so it is removed here, in the same transaction, as
// the web's manual delete did: private nicknames, push subscriptions, custom
// stickers, and the social content (posts, reactions, comments,
// notifications, pending photos and reports by or about the trainee).
@Injectable()
export class TraineeDeletionService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // True when the user existed.
  delete(userId: number): Promise<boolean> {
    const key = userActorKey(userId);

    return this.dataSource.transaction(async (em) => {
      const postIds = (
        await em.find(SocialPost, {
          where: { authorKind: "user", authorId: userId },
          select: { id: true },
        })
      ).map((post) => post.id);
      const commentIds = (
        await em.find(SocialComment, {
          where: [
            { authorKey: key },
            ...(postIds.length > 0 ? [{ postId: In(postIds) }] : []),
          ],
          select: { id: true },
        })
      ).map((comment) => comment.id);

      // Reports first: they point at the trainee's posts and comments.
      await em.delete(SocialReport, [
        { reporterKey: key },
        { targetKind: "user", targetId: userId },
        ...(postIds.length > 0
          ? [{ targetKind: "post" as const, targetId: In(postIds) }]
          : []),
        ...(commentIds.length > 0
          ? [{ targetKind: "comment" as const, targetId: In(commentIds) }]
          : []),
      ]);
      // Posts take their photos, reactions, comments and notifications along.
      await em.delete(SocialPost, { authorKind: "user", authorId: userId });
      // What the account left on other people's posts.
      await em.delete(SocialReaction, { reactorKey: key });
      await em.delete(SocialComment, { authorKey: key });
      await em.delete(SocialNotification, [
        { recipientKey: key },
        { actorKey: key },
      ]);
      // Uploads that never became a post.
      await em.delete(SocialPostPhoto, { uploaderKey: key });
      await em.delete(ContactAlias, [{ ownerKey: key }, { targetKey: key }]);
      await em.delete(PushSubscription, { ownerKey: key });
      await em.delete(ChatCustomSticker, {
        ownerKind: "user",
        ownerId: userId,
      });

      const result = await em.delete(User, { id: userId });

      return (result.affected ?? 0) > 0;
    });
  }
}
