import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { userActorKey } from "@pt/contracts";
import { DataSource } from "typeorm";

import { ChatCustomSticker } from "../database/entities/chat-custom-sticker.entity.js";
import { ContactAlias } from "../database/entities/contact-alias.entity.js";
import { PushSubscription } from "../database/entities/push-subscription.entity.js";
import { User } from "../database/entities/user.entity.js";
import { SocialCleanupService } from "../social/social-cleanup.service.js";

// Deleting a trainee. Everything linked to the user row by a foreign key
// (hidden-trainee rows, chat conversations with their messages, reads,
// colours, nicknames, photos, workouts, sets, completions, nutrition, meal
// plans, logs and marks, friendships, blocks, DMs, sessions) goes with it
// through ON DELETE CASCADE. What is keyed by text ("user:<id>", owner kind +
// id) is also cascaded now, through the generated account-id columns of the
// DbIntegrity migration. The explicit deletes stay: they remove what the
// cascades do not reach (content on the trainee's posts, reports about their
// posts and comments) and keep working if a key is not account-shaped:
// private nicknames, push subscriptions, custom stickers, and the social
// content (SocialCleanupService owns that: posts, reactions, comments,
// notifications, pending photos and reports by or about the trainee).
@Injectable()
export class TraineeDeletionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly social: SocialCleanupService,
  ) {}

  // True when the user existed.
  delete(userId: number): Promise<boolean> {
    const key = userActorKey(userId);

    return this.dataSource.transaction(async (em) => {
      await this.social.deleteContentOfUser(em, userId);
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
