import type {
  SocialCommentResponse,
  SocialNotificationPageResponse,
  SocialPostPageResponse,
  SocialPostResponse,
  SocialProfileResponse,
} from "@pt/contracts";

import type { CommentView } from "./engagement.service.js";
import type { NotificationPageView } from "./notifications/notifications.service.js";
import type { PostPageView, PostView } from "./posts.queries.js";
import type { ProfileView } from "./profiles.service.js";
import type { ReportView } from "./reports.service.js";

// View -> response. Explicit field lists: a new column never reaches a client
// by accident, and entities are never returned.

export const socialPhotoUrl = (id: number) => `/v1/social/photos/${id}`;

export const toPostResponse = (post: PostView): SocialPostResponse => ({
  id: post.id,
  authorKind: post.authorKind,
  authorId: post.authorId,
  authorName: post.authorName,
  authorAvatarUrl: post.authorAvatarUrl,
  authorVerified: post.authorVerified,
  caption: post.caption,
  privacy: post.privacy,
  photo: post.photo
    ? {
        id: post.photo.id,
        url: socialPhotoUrl(post.photo.id),
        width: post.photo.width,
        height: post.photo.height,
      }
    : null,
  createdAt: post.createdAt.toISOString(),
  edited: post.edited,
  canEdit: post.canEdit,
  canDelete: post.canDelete,
  reactions: {
    counts: post.reactions.counts.map(({ emoji, count }) => ({ emoji, count })),
    total: post.reactions.total,
    mine: post.reactions.mine,
  },
  commentCount: post.commentCount,
});

export const toPostPageResponse = (page: PostPageView): SocialPostPageResponse => ({
  items: page.items.map(toPostResponse),
  nextCursor: page.nextCursor,
});

export const toCommentResponse = (comment: CommentView): SocialCommentResponse => ({
  id: comment.id,
  authorKind: comment.authorKind,
  authorId: comment.authorId,
  authorName: comment.authorName,
  authorAvatarUrl: comment.authorAvatarUrl,
  authorVerified: comment.authorVerified,
  body: comment.body,
  createdAt: comment.createdAt.toISOString(),
  edited: comment.edited,
  canEdit: comment.canEdit,
  canDelete: comment.canDelete,
});

export const toNotificationPageResponse = (
  page: NotificationPageView,
): SocialNotificationPageResponse => ({
  items: page.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    text: item.text,
    postId: item.postId,
    actorKey: item.actorKey,
    actorName: item.actorName,
    actorAvatarUrl: item.actorAvatarUrl,
    createdAt: item.createdAt.toISOString(),
    isUnread: item.isUnread,
  })),
  nextCursor: page.nextCursor,
  unreadCount: page.unreadCount,
});

export const toProfileResponse = (profile: ProfileView): SocialProfileResponse => ({
  kind: profile.kind,
  id: profile.id,
  name: profile.name,
  realName: profile.realName,
  alias: profile.alias,
  avatarUrl: profile.avatarUrl,
  verified: profile.verified,
  bio: profile.bio,
  role: profile.role,
  isOwn: profile.isOwn,
  relationship: profile.relationship,
  friendCount: profile.friendCount,
  stats: profile.stats,
  canBlock: profile.canBlock,
  canReport: profile.canReport,
  composerPrivacy: profile.composerPrivacy,
});

export const toReportResponse = (report: ReportView) => ({
  id: report.id,
  targetKind: report.targetKind,
  targetId: report.targetId,
  reporterName: report.reporterName,
  reason: report.reason,
  createdAt: report.createdAt.toISOString(),
  preview: report.preview,
  targetName: report.targetName,
  postId: report.postId,
});
