// Social network: limits, messages and codes shared by the API and every
// client. Ported from apps/web/features/social/constants/social.ts; the text
// stays the same so the web shows what it showed before.

// Version of the Terms text. Bump it after editing the terms: everyone has to
// accept again.
export const SOCIAL_TERMS_VERSION = 1;

export const SOCIAL_CAPTION_MAX_LENGTH = 2000;
export const SOCIAL_BIO_MAX_LENGTH = 150;
export const SOCIAL_COMMENT_MAX_LENGTH = 1000;
export const SOCIAL_REPORT_REASON_MAX_LENGTH = 500;

export const SOCIAL_PAGE_LIMITS = {
  POSTS: { DEFAULT: 10, MAX: 50 },
  COMMENTS: { DEFAULT: 50, MAX: 100 },
  NOTIFICATIONS: { DEFAULT: 50, MAX: 100 },
} as const;

// Notifications older than this are dropped when the list is read.
export const SOCIAL_NOTIFICATION_RETENTION_DAYS = 60;

// Post photos are re-encoded by the client; same target as chat photos.
export const SOCIAL_POST_PHOTO_MAX_BYTES = 400 * 1024;
// Longest side the client resizes to; the API refuses more.
export const SOCIAL_PHOTO_MAX_SIDE = 1600;
// An upload that never became a post is dropped after this long.
export const SOCIAL_PHOTO_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

// Friend requests a trainee may send per day.
export const SOCIAL_FRIEND_REQUESTS_PER_DAY = 20;
export const SOCIAL_FRIEND_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

export const SOCIAL_POST_PRIVACIES = ["everyone", "friends", "only_me"] as const;
export type SocialPostPrivacy = (typeof SOCIAL_POST_PRIVACIES)[number];
export const SOCIAL_DEFAULT_POST_PRIVACY: SocialPostPrivacy = "friends";

export const SOCIAL_AUTHOR_KINDS = ["user", "admin"] as const;
export type SocialAuthorKind = (typeof SOCIAL_AUTHOR_KINDS)[number];

// The same six emoji as chat; a null reaction removes mine.
export const SOCIAL_REACTION_EMOJIS = [
  "❤️",
  "😂",
  "😮",
  "😢",
  "💪",
  "👍",
] as const;
export type SocialReactionEmoji = (typeof SOCIAL_REACTION_EMOJIS)[number];
// Emoji shown in the reaction summary under a post.
export const SOCIAL_REACTION_SUMMARY_TOP = 3;

export const SOCIAL_NOTIFICATION_KINDS = [
  "friend_request",
  "friend_accepted",
  "post_reaction",
  "post_comment",
  "admin_post",
] as const;
export type SocialNotificationKind = (typeof SOCIAL_NOTIFICATION_KINDS)[number];

export const SOCIAL_REPORT_TARGET_KINDS = ["post", "comment", "user"] as const;
export type SocialReportTargetKind = (typeof SOCIAL_REPORT_TARGET_KINDS)[number];

export const SOCIAL_RELATIONSHIPS = [
  "none",
  "friends",
  "sent",
  "received",
] as const;
export type SocialRelationship = (typeof SOCIAL_RELATIONSHIPS)[number];

export const SOCIAL_MESSAGES = {
  TERMS_REQUIRED:
    "Bạn cần đồng ý Điều khoản sử dụng trước khi dùng tính năng này.",
  EMPTY_POST: "Hãy viết nội dung hoặc chọn một ảnh.",
  CAPTION_TOO_LONG: `Nội dung tối đa ${SOCIAL_CAPTION_MAX_LENGTH} ký tự.`,
  BIO_TOO_LONG: `Giới thiệu tối đa ${SOCIAL_BIO_MAX_LENGTH} ký tự.`,
  NOT_FOUND: "Không tìm thấy bài viết.",
  NOT_ALLOWED: "Bạn không có quyền thực hiện thao tác này.",
  PHOTO_NOT_FOUND: "Không tìm thấy ảnh. Hãy chọn lại ảnh.",
  PHOTO_TOO_LARGE: "Ảnh quá lớn. Hãy chọn ảnh khác.",
  PHOTO_BAD_IMAGE: "Chỉ gửi được ảnh JPEG, PNG hoặc WebP. Hãy chọn lại ảnh.",
  COMMENT_EMPTY: "Hãy viết nội dung bình luận.",
  COMMENT_TOO_LONG: `Bình luận tối đa ${SOCIAL_COMMENT_MAX_LENGTH} ký tự.`,
  COMMENT_NOT_FOUND: "Không tìm thấy bình luận.",
  REACTION_INVALID: "Cảm xúc không hợp lệ.",
  IDEMPOTENCY_KEY_INVALID: "Idempotency-Key không hợp lệ.",
} as const;

export const SOCIAL_FRIEND_MESSAGES = {
  NOT_FOUND: "Không tìm thấy người dùng.",
  EMAIL_INVALID: "Hãy nhập đúng địa chỉ email đầy đủ.",
  ALREADY_FRIENDS: "Hai bạn đã là bạn bè.",
  ALREADY_REQUESTED: "Bạn đã gửi lời mời cho người này.",
  RATE_LIMITED:
    "Bạn đã gửi quá nhiều lời mời hôm nay. Hãy thử lại vào ngày mai.",
  REQUEST_NOT_FOUND: "Không tìm thấy lời mời kết bạn.",
  REASON_TOO_LONG: `Lý do tối đa ${SOCIAL_REPORT_REASON_MAX_LENGTH} ký tự.`,
  REPORT_NOT_FOUND: "Không tìm thấy báo cáo.",
} as const;

// Stable `code` of every social error body.
export const SOCIAL_ERROR_CODES = {
  TERMS_REQUIRED: "TERMS_REQUIRED",
  EMPTY_POST: "EMPTY_POST",
  POST_NOT_FOUND: "POST_NOT_FOUND",
  COMMENT_NOT_FOUND: "COMMENT_NOT_FOUND",
  PHOTO_NOT_FOUND: "PHOTO_NOT_FOUND",
  PHOTO_TOO_LARGE: "PHOTO_TOO_LARGE",
  BAD_IMAGE: "BAD_IMAGE",
  NOT_ALLOWED: "SOCIAL_FORBIDDEN",
  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  EMAIL_INVALID: "EMAIL_INVALID",
  ALREADY_FRIENDS: "ALREADY_FRIENDS",
  ALREADY_REQUESTED: "ALREADY_REQUESTED",
  RATE_LIMITED: "FRIEND_REQUEST_RATE_LIMITED",
  REPORT_NOT_FOUND: "REPORT_NOT_FOUND",
  IDEMPOTENCY_KEY_INVALID: "IDEMPOTENCY_KEY_INVALID",
} as const;

// An actor key is how reactions, comments, notifications and reports point at
// a person: "user:<id>" or "admin:<id>".
export const socialActorKey = (kind: SocialAuthorKind, id: number) =>
  `${kind}:${id}`;

const ACTOR_KEY = /^(user|admin):([1-9]\d{0,8})$/;

export const parseSocialActorKey = (
  key: string,
): { kind: SocialAuthorKind; id: number } | null => {
  const match = ACTOR_KEY.exec(key);

  return match
    ? { kind: match[1] as SocialAuthorKind, id: Number(match[2]) }
    : null;
};

// A friendship is one row per pair, smaller id first.
export const socialPairOf = (a: number, b: number) =>
  a < b ? { low: a, high: b } : { low: b, high: a };
