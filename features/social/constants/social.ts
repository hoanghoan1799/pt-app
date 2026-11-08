// Version of the Terms page text (spec T1, A8). Bump it after editing
// /terms: everyone has to accept again.
export const TERMS_VERSION = 1;

export const CAPTION_MAX_LENGTH = 2000;
export const BIO_MAX_LENGTH = 150;
export const POSTS_PAGE_SIZE = 20;
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
} as const;
