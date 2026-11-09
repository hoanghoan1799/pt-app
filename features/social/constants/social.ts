// Version of the Terms page text (spec T1, A8). Bump it after editing
// /terms: everyone has to accept again.
export const TERMS_VERSION = 1;

export const CAPTION_MAX_LENGTH = 2000;
export const BIO_MAX_LENGTH = 150;
export const POSTS_PAGE_SIZE = 10;
// The next page starts loading once the viewer reaches this post (1-based) of
// the last loaded page, so it is usually there before they hit the end.
export const POSTS_PREFETCH_AT = 7;
export const COMMENT_MAX_LENGTH = 1000;
// Spec A4: the page shows the latest 50, rows older than 60 days are dropped.
export const NOTIFICATIONS_PAGE_SIZE = 50;
export const NOTIFICATION_RETENTION_DAYS = 60;
// Spec R7: at most one reaction push per post per recipient per hour.
export const REACTION_PUSH_INTERVAL_MS = 60 * 60 * 1000;
// Emoji shown in the reaction summary under a post.
export const REACTION_SUMMARY_TOP = 3;
// Comment text shown in a push (the lock screen is semi-public).
export const PUSH_COMMENT_PREVIEW_LENGTH = 60;
// Post photos are re-encoded in the browser; same target as chat photos.
export const POST_PHOTO_MAX_BYTES = 400 * 1024;

export const POST_PRIVACIES = ["everyone", "friends", "only_me"] as const;
export const DEFAULT_POST_PRIVACY = "friends";

export const PRIVACY_LABELS: Record<(typeof POST_PRIVACIES)[number], string> = {
  everyone: "Mọi người",
  friends: "Bạn bè",
  only_me: "Chỉ mình tôi",
};

export const SOCIAL_MESSAGES = {
  TERMS_REQUIRED:
    "Bạn cần đồng ý Điều khoản sử dụng trước khi dùng tính năng này.",
  EMPTY_POST: "Hãy viết nội dung hoặc chọn một ảnh.",
  CAPTION_TOO_LONG: `Nội dung tối đa ${CAPTION_MAX_LENGTH} ký tự.`,
  BIO_TOO_LONG: `Giới thiệu tối đa ${BIO_MAX_LENGTH} ký tự.`,
  NOT_FOUND: "Không tìm thấy bài viết.",
  NOT_ALLOWED: "Bạn không có quyền thực hiện thao tác này.",
  PHOTO_NOT_FOUND: "Không tìm thấy ảnh. Hãy chọn lại ảnh.",
  PHOTO_TOO_LARGE: "Ảnh quá lớn. Hãy chọn ảnh khác.",
  COMMENT_EMPTY: "Hãy viết nội dung bình luận.",
  COMMENT_TOO_LONG: `Bình luận tối đa ${COMMENT_MAX_LENGTH} ký tự.`,
  COMMENT_NOT_FOUND: "Không tìm thấy bình luận.",
  REACTION_INVALID: "Cảm xúc không hợp lệ.",
} as const;

// Spec A5: friend requests a trainee may send per day.
export const FRIEND_REQUESTS_PER_DAY = 20;
export const FRIEND_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;
export const REPORT_REASON_MAX_LENGTH = 500;

export const FRIEND_MESSAGES = {
  NOT_FOUND: "Không tìm thấy người dùng.",
  EMAIL_INVALID: "Hãy nhập đúng địa chỉ email đầy đủ.",
  SEARCH_EMPTY: "Không tìm thấy ai với email này.",
  ALREADY_FRIENDS: "Hai bạn đã là bạn bè.",
  ALREADY_REQUESTED: "Bạn đã gửi lời mời cho người này.",
  RATE_LIMITED:
    "Bạn đã gửi quá nhiều lời mời hôm nay. Hãy thử lại vào ngày mai.",
  REQUEST_NOT_FOUND: "Không tìm thấy lời mời kết bạn.",
  REASON_TOO_LONG: `Lý do tối đa ${REPORT_REASON_MAX_LENGTH} ký tự.`,
  REPORT_NOT_FOUND: "Không tìm thấy báo cáo.",
  REPORT_SENT: "Đã gửi báo cáo. Cảm ơn bạn.",
  BLOCKED: "Đã chặn người dùng.",
  UNBLOCKED: "Đã bỏ chặn.",
} as const;
