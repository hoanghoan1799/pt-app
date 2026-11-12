import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { adminActorKey, PT_ALIAS_TARGET, userActorKey } from "@pt/contracts";

import {
  CHAT_EVENTS,
  type ChatMessageSentEvent,
  type ChatReactionChangedEvent,
} from "../chat/chat.events.js";
import { Clock } from "../common/clock.js";
import {
  type NotificationCreatedEvent,
  SOCIAL_EVENTS,
} from "../social/events/social.events.js";
import { deletedAccountName } from "../social/notifications/notification-content.js";
import {
  PT_FALLBACK_NAME,
  pushContent,
  traineeFallbackName,
} from "./content/index.js";
import {
  adminOwnerKey,
  PushRecipients,
  userOwnerKey,
} from "./push.recipients.js";
import { PushService } from "./push.service.js";

// A reaction push goes out at most once an hour per post and recipient (R7).
export const REACTION_PUSH_INTERVAL_MS = 60 * 60 * 1000;

export const shouldPushReaction = (lastPushedAt: Date | null, now: Date) =>
  lastPushedAt === null ||
  now.getTime() - lastPushedAt.getTime() >= REACTION_PUSH_INTERVAL_MS;

// Domain events -> pushes, with the same recipients, titles and bodies as the
// web: chat messages (not /imlang silent ones), reactions that add or replace
// an emoji, and the social notifications. Chat and Social only emit events;
// they never import a sender. Listeners never throw.
@Injectable()
export class PushNotifier {
  private readonly logger = new Logger(PushNotifier.name);

  constructor(
    private readonly push: PushService,
    private readonly recipients: PushRecipients,
    private readonly clock: Clock,
  ) {}

  private async guarded(name: string, work: () => Promise<void>) {
    try {
      if (this.push.isEnabled()) {
        await work();
      }
    } catch (error) {
      // Only the message: payloads carry message text.
      this.logger.error(
        `Push for ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @OnEvent(CHAT_EVENTS.messageSent)
  onMessageSent(event: ChatMessageSentEvent) {
    // /imlang: stored and published, but no push.
    if (event.silent) {
      return Promise.resolve();
    }
    return this.guarded(CHAT_EVENTS.messageSent, async () => {
      const base = {
        traineeUserId: event.traineeUserId,
        conversationId: event.conversationId,
        body: event.body,
        sticker: event.hasSticker,
        photo: event.hasPhoto,
      };

      if (event.senderRole === "user") {
        const traineeName = await this.recipients.traineeName(
          event.traineeUserId,
        );

        for (const admin of await this.recipients.adminsForTrainee(
          event.traineeUserId,
        )) {
          const owner = adminOwnerKey(admin.adminId);
          const alias = await this.recipients.aliasFor(owner, [
            userActorKey(event.traineeUserId),
          ]);

          await this.push.sendToOwner(
            owner,
            pushContent.chat_message({
              ...base,
              recipientRole: "admin",
              senderName:
                alias || traineeName || traineeFallbackName(admin.locale),
              locale: admin.locale,
            }),
          );
        }
        return;
      }
      const owner = userOwnerKey(event.traineeUserId);
      // The title names the PT the way the trainee calls them: a nickname for
      // that admin, else for the whole PT side, else the real name.
      const alias = await this.recipients.aliasFor(owner, [
        ...(event.senderAdminId === null
          ? []
          : [adminActorKey(event.senderAdminId)]),
        PT_ALIAS_TARGET,
      ]);
      const realName =
        event.senderAdminId === null
          ? null
          : await this.recipients.adminName(event.senderAdminId);

      await this.push.sendToOwner(
        owner,
        pushContent.chat_message({
          ...base,
          recipientRole: "user",
          senderName: alias || realName || PT_FALLBACK_NAME,
          locale: await this.recipients.localeOf(owner),
        }),
      );
    });
  }

  // Only adding or replacing an emoji pushes, and only the author of the
  // message hears it, never the reactor themself.
  @OnEvent(CHAT_EVENTS.reactionChanged)
  onReaction(event: ChatReactionChangedEvent) {
    const emoji = event.emoji;

    if (emoji === null) {
      return Promise.resolve();
    }
    return this.guarded(CHAT_EVENTS.reactionChanged, async () => {
      const reactorIsAdmin = event.reactorKey.startsWith("admin:");
      let owner: string;
      let recipientRole: "user" | "admin";
      let locale;

      if (event.authorRole === "user") {
        // A trainee reacting to their own message tells nobody.
        if (!reactorIsAdmin) {
          return;
        }
        owner = userOwnerKey(event.traineeUserId);
        recipientRole = "user";
        locale = await this.recipients.localeOf(owner);
      } else {
        if (
          event.authorAdminId === null ||
          event.reactorKey === adminActorKey(event.authorAdminId)
        ) {
          return;
        }
        const admin = await this.recipients.adminForTrainee(
          event.authorAdminId,
          event.traineeUserId,
        );

        if (!admin) {
          return;
        }
        owner = adminOwnerKey(admin.adminId);
        recipientRole = "admin";
        locale = admin.locale;
      }
      // The recipient's own nickname for the reactor (a trainee also has one
      // for the whole PT side), never anybody else's.
      const alias = await this.recipients.aliasFor(owner, [
        event.reactorKey,
        ...(recipientRole === "user" && reactorIsAdmin
          ? [PT_ALIAS_TARGET]
          : []),
      ]);

      await this.push.sendToOwner(
        owner,
        pushContent.chat_reaction({
          recipientRole,
          reactorName: alias || event.reactorName,
          emoji,
          traineeUserId: event.traineeUserId,
          conversationId: event.conversationId,
          locale,
        }),
      );
    });
  }

  // Friend requests and acceptances, post comments and reactions, and new
  // admin posts. Reactions are throttled per post; an admin post is skipped
  // when it was deleted before the push went out.
  @OnEvent(SOCIAL_EVENTS.NOTIFICATION_CREATED)
  onSocialNotification(event: NotificationCreatedEvent) {
    return this.guarded(SOCIAL_EVENTS.NOTIFICATION_CREATED, async () => {
      const isFriendEvent =
        event.kind === "friend_request" || event.kind === "friend_accepted";

      if (!isFriendEvent && event.postId === null) {
        return;
      }
      const owner = event.recipientKey;

      if (!(await this.push.hasDevices(owner))) {
        return;
      }
      const now = this.clock.now();

      if (event.kind === "post_reaction" && event.postId !== null) {
        const last = await this.recipients.lastReactionPushAt(
          owner,
          event.postId,
        );

        if (!shouldPushReaction(last, now)) {
          return;
        }
      }
      let caption: string | null = null;

      if (event.kind === "admin_post" && event.postId !== null) {
        const post = await this.recipients.livePostCaption(event.postId);

        if (!post) {
          return;
        }
        caption = post.caption;
      }
      const locale = await this.recipients.localeOf(owner);
      const actorName = await this.actorNameFor(
        owner,
        event.actorKey,
        deletedAccountName(locale),
      );

      await this.recipients.markPushed(event.notificationId, now);
      await this.push.sendToOwner(
        owner,
        pushContent.social({
          kind: event.kind,
          actorName,
          locale,
          recipientKey: owner,
          postId: event.postId,
          commentBody: event.commentBody,
          caption,
        }),
      );
    });
  }

  // The actor as the recipient calls them: their nickname, else the real name.
  private async actorNameFor(
    owner: string,
    actorKey: string,
    fallback: string,
  ) {
    const [alias, realName] = await Promise.all([
      this.recipients.aliasFor(owner, [actorKey]),
      this.recipients.nameOf(actorKey),
    ]);

    return alias || realName || fallback;
  }
}
