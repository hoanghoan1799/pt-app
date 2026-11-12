import type {
  SocialAuthorKind,
  SocialNotificationKind,
  SocialPostPrivacy,
} from "@pt/contracts";

// Domain events of the social network, published after the database commit.
// SocialModule's own NotificationsListener turns them into notification rows;
// chat and push can listen to the same names later without Social knowing.

export const SOCIAL_EVENTS = {
  FRIEND_REQUESTED: "social.friend.requested",
  FRIEND_ACCEPTED: "social.friend.accepted",
  // The asked person said no, or the asker took the request back.
  FRIEND_REQUEST_ENDED: "social.friend.request_ended",
  // Blocking clears the friend notifications between the two.
  USER_BLOCKED: "social.user.blocked",
  POST_PUBLISHED: "social.post.published",
  POST_REACTED: "social.post.reacted",
  REACTION_REMOVED: "social.post.reaction_removed",
  POST_COMMENTED: "social.post.commented",
  // A notification row was created or refreshed: the hook for push.
  NOTIFICATION_CREATED: "social.notification.created",
} as const;

export type FriendRequestedEvent = { requesterId: number; targetId: number };
export type FriendAcceptedEvent = { accepterId: number; requesterId: number };
export type FriendRequestEndedEvent = {
  // The person whose notification list loses the request.
  recipientId: number;
  actorId: number;
};
export type UserBlockedEvent = { blockerId: number; blockedId: number };
export type PostPublishedEvent = {
  postId: number;
  authorKind: SocialAuthorKind;
  authorId: number;
  privacy: SocialPostPrivacy;
  // The admin revealed hidden trainees: they are told as well.
  includeHidden: boolean;
  at: Date;
};
export type PostReactedEvent = {
  postId: number;
  reactorKey: string;
  recipientKey: string;
  emoji: string;
  at: Date;
};
export type ReactionRemovedEvent = {
  postId: number;
  reactorKey: string;
  recipientKey: string;
};
export type PostCommentedEvent = {
  postId: number;
  commentId: number;
  authorKey: string;
  recipientKey: string;
  body: string;
  at: Date;
};
export type NotificationCreatedEvent = {
  notificationId: number;
  kind: SocialNotificationKind;
  recipientKey: string;
  actorKey: string;
  postId: number | null;
  // Only a comment push carries text; it is never stored on the notification.
  commentBody?: string;
  at: Date;
};
