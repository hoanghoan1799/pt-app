import type {
  SocialCommentResponse,
  SocialNotificationPageResponse,
  SocialPostResponse,
  SocialProfileResponse,
} from "@pt/contracts";

import type {
  CommentView,
  NotificationView,
  PostView,
  ProfilePageData,
  ReportView,
} from "@/features/social/types/social";
import {
  adminPostPath,
  notificationHref,
  notificationText,
} from "@/features/social/utils/engagement-rules";
import {
  adminProfilePath,
  profilePath,
  socialPhotoUrl,
} from "@/features/social/utils/post-rules";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

// API answers -> the plain data the UI draws. Pure: no network, no cookies.
// The API sends ISO dates and its own file paths (`/v1/...`); the UI wants
// epoch milliseconds and the web's `/api/...` proxies.

const API_AVATAR_PREFIX = "/v1/avatars/";

export const webAvatarUrl = (url: string | null) =>
  url === null
    ? null
    : url.startsWith(API_AVATAR_PREFIX)
      ? `/api/avatar/${url.slice(API_AVATAR_PREFIX.length)}`
      : url;

export const toPostView = (post: SocialPostResponse): PostView => ({
  id: post.id,
  authorKind: post.authorKind,
  authorId: post.authorId,
  authorName: post.authorName,
  authorAvatarUrl: webAvatarUrl(post.authorAvatarUrl),
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
  createdAt: Date.parse(post.createdAt),
  edited: post.edited,
  canEdit: post.canEdit,
  canDelete: post.canDelete,
  reactions: post.reactions,
  commentCount: post.commentCount,
});

export const toCommentView = (
  comment: SocialCommentResponse,
  mode: "user" | "admin",
): CommentView => {
  const toPath = mode === "admin" ? adminProfilePath : profilePath;

  return {
    id: comment.id,
    authorName: comment.authorName,
    authorAvatarUrl: webAvatarUrl(comment.authorAvatarUrl),
    authorVerified: comment.authorVerified,
    authorHref: toPath(comment.authorKind, comment.authorId),
    body: comment.body,
    createdAt: Date.parse(comment.createdAt),
    edited: comment.edited,
    canEdit: comment.canEdit,
    canDelete: comment.canDelete,
  };
};

// The API says what happened and to which post; the words and the link are
// the web's (the locale and the route shapes live here).
export const toNotificationView = (
  item: SocialNotificationPageResponse["items"][number],
  mode: "user" | "admin",
  locale: Locale = DEFAULT_LOCALE,
): NotificationView => ({
  id: item.id,
  kind: item.kind,
  text: notificationText(item.kind, item.actorName, locale),
  href: notificationHref(item.kind, `${mode}:0`, item.postId),
  actorName: item.actorName,
  actorAvatarUrl: webAvatarUrl(item.actorAvatarUrl),
  createdAt: Date.parse(item.createdAt),
  isUnread: item.isUnread,
});

export const toProfilePageData = (
  profile: SocialProfileResponse,
): ProfilePageData => ({
  profile: {
    kind: profile.kind,
    id: profile.id,
    name: profile.name,
    realName: profile.realName,
    alias: profile.alias,
    avatarUrl: webAvatarUrl(profile.avatarUrl),
    verified: profile.verified,
    bio: profile.bio,
    role: profile.role,
  },
  isOwn: profile.isOwn,
  relationship: profile.relationship,
  friendCount: profile.friendCount,
  stats: profile.stats,
  canBlock: profile.canBlock,
  canReport: profile.canReport,
  composerPrivacy: profile.composerPrivacy,
});

export interface ApiReport {
  id: number;
  targetKind: "post" | "comment" | "user";
  targetId: number;
  reporterName: string;
  reason: string;
  createdAt: string;
  preview: string | null;
  targetName: string | null;
  postId: number | null;
}

// Where the super admin looks at a reported thing: the post (also for a
// comment), the trainee's profile; nothing once the content is gone.
const reportHref = (report: ApiReport) => {
  if (report.targetKind === "user") {
    return report.targetName === null
      ? null
      : adminProfilePath("user", report.targetId);
  }
  return report.preview === null || report.postId === null
    ? null
    : adminPostPath(report.postId);
};

export const toReportView = (report: ApiReport): ReportView => ({
  id: report.id,
  targetKind: report.targetKind,
  targetId: report.targetId,
  reporterName: report.reporterName,
  reason: report.reason,
  createdAt: Date.parse(report.createdAt),
  preview: report.preview,
  targetName: report.targetName,
  href: reportHref(report),
});
