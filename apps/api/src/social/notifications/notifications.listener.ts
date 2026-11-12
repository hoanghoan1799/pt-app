import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { shouldNotifyAdminPost } from "../domain/admin-post.js";
import {
  type FriendAcceptedEvent,
  type FriendRequestedEvent,
  type FriendRequestEndedEvent,
  type NotificationCreatedEvent,
  type PostCommentedEvent,
  type PostPublishedEvent,
  type PostReactedEvent,
  type ReactionRemovedEvent,
  SOCIAL_EVENTS,
  type UserBlockedEvent,
} from "../events/social.events.js";
import { SocialEventsPublisher } from "../events/social-events.publisher.js";
import { NotificationsService } from "./notifications.service.js";

const userKey = (id: number) => `user:${id}`;

// Turns domain events into notification rows, then announces each row on
// `social.notification.created` so push (and later chat) can react.
@Injectable()
export class NotificationsListener {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly events: SocialEventsPublisher,
  ) {}

  private async created(event: NotificationCreatedEvent) {
    await this.events.publish(SOCIAL_EVENTS.NOTIFICATION_CREATED, event);
  }

  @OnEvent(SOCIAL_EVENTS.FRIEND_REQUESTED)
  async onFriendRequested(event: FriendRequestedEvent) {
    const at = new Date();
    const notificationId = await this.notifications.createFriend({
      recipientKey: userKey(event.targetId),
      actorKey: userKey(event.requesterId),
      kind: "friend_request",
      at,
    });

    await this.created({
      notificationId,
      kind: "friend_request",
      recipientKey: userKey(event.targetId),
      actorKey: userKey(event.requesterId),
      postId: null,
      at,
    });
  }

  @OnEvent(SOCIAL_EVENTS.FRIEND_ACCEPTED)
  async onFriendAccepted(event: FriendAcceptedEvent) {
    const at = new Date();

    // The request is answered: drop it from my list, tell the requester.
    await this.notifications.removeFriend(
      userKey(event.accepterId),
      userKey(event.requesterId),
    );
    const notificationId = await this.notifications.createFriend({
      recipientKey: userKey(event.requesterId),
      actorKey: userKey(event.accepterId),
      kind: "friend_accepted",
      at,
    });

    await this.created({
      notificationId,
      kind: "friend_accepted",
      recipientKey: userKey(event.requesterId),
      actorKey: userKey(event.accepterId),
      postId: null,
      at,
    });
  }

  @OnEvent(SOCIAL_EVENTS.FRIEND_REQUEST_ENDED)
  async onFriendRequestEnded(event: FriendRequestEndedEvent) {
    await this.notifications.removeFriend(
      userKey(event.recipientId),
      userKey(event.actorId),
      ["friend_request"],
    );
  }

  @OnEvent(SOCIAL_EVENTS.USER_BLOCKED)
  async onUserBlocked(event: UserBlockedEvent) {
    await this.notifications.removeFriend(
      userKey(event.blockerId),
      userKey(event.blockedId),
    );
    await this.notifications.removeFriend(
      userKey(event.blockedId),
      userKey(event.blockerId),
    );
  }

  @OnEvent(SOCIAL_EVENTS.POST_REACTED)
  async onPostReacted(event: PostReactedEvent) {
    // Nobody is told about a reaction to their own post.
    if (event.recipientKey === event.reactorKey) {
      return;
    }
    const notificationId = await this.notifications.upsertReaction(
      {
        recipientKey: event.recipientKey,
        actorKey: event.reactorKey,
        postId: event.postId,
      },
      event.at,
    );

    await this.created({
      notificationId,
      kind: "post_reaction",
      recipientKey: event.recipientKey,
      actorKey: event.reactorKey,
      postId: event.postId,
      at: event.at,
    });
  }

  @OnEvent(SOCIAL_EVENTS.REACTION_REMOVED)
  async onReactionRemoved(event: ReactionRemovedEvent) {
    await this.notifications.removeReaction({
      recipientKey: event.recipientKey,
      actorKey: event.reactorKey,
      postId: event.postId,
    });
  }

  @OnEvent(SOCIAL_EVENTS.POST_COMMENTED)
  async onPostCommented(event: PostCommentedEvent) {
    if (event.recipientKey === event.authorKey) {
      return;
    }
    const notificationId = await this.notifications.create({
      recipientKey: event.recipientKey,
      kind: "post_comment",
      actorKey: event.authorKey,
      postId: event.postId,
      at: event.at,
    });

    await this.created({
      notificationId,
      kind: "post_comment",
      recipientKey: event.recipientKey,
      actorKey: event.authorKey,
      postId: event.postId,
      commentBody: event.body,
      at: event.at,
    });
  }

  // A new admin post tells the trainees who can see it. Never fails the post.
  @OnEvent(SOCIAL_EVENTS.POST_PUBLISHED)
  async onPostPublished(event: PostPublishedEvent) {
    if (event.authorKind !== "admin" || !shouldNotifyAdminPost(event.privacy)) {
      return;
    }
    const recipientIds = await this.notifications.adminPostRecipientIds(
      event.authorId,
      event.includeHidden,
    );
    const ids = await this.notifications.createAdminPost({
      adminId: event.authorId,
      postId: event.postId,
      recipientIds,
      at: event.at,
    });

    for (const { id, recipientKey } of ids) {
      await this.created({
        notificationId: id,
        kind: "admin_post",
        recipientKey,
        actorKey: `admin:${event.authorId}`,
        postId: event.postId,
        at: event.at,
      });
    }
  }
}
