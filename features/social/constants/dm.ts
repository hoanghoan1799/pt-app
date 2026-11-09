export const DM_BODY_MAX_LENGTH = 2000;
export const DM_PAGE_SIZE = 50;
export const DM_POLL_MS = 5000;
// Photos use the same 400 KB target as post photos.
export { POST_PHOTO_MAX_BYTES as DM_PHOTO_MAX_BYTES } from "@/features/social/constants/social";

export const DM_COACH_TITLE = "Huấn luyện viên";

export const DM_MESSAGES = {
  NOT_FOUND: "Không tìm thấy cuộc trò chuyện.",
  DISABLED:
    "Học viên không thể nhắn tin với nhau. Bạn chỉ có thể nhắn tin với PT của mình.",
  READ_ONLY: "Hai bạn không còn là bạn bè, nên không thể nhắn tin thêm.",
  EMPTY: "Hãy viết tin nhắn hoặc chọn một ảnh.",
  TOO_LONG: `Tin nhắn tối đa ${DM_BODY_MAX_LENGTH} ký tự.`,
  PHOTO_NOT_FOUND: "Không tìm thấy ảnh. Hãy chọn lại ảnh.",
  POST_NOT_FOUND: "Không thể trả lời bài viết này.",
  POST_UNAVAILABLE: "Bài viết không còn khả dụng",
  REPLY_TO_POST: "Trả lời qua tin nhắn",
  REPLYING_TO_POST: "Đang trả lời bài viết",
  CANCEL_REPLY: "Bỏ trả lời bài viết",
  SEND_FAILED: "Không gửi được tin nhắn. Thử lại nhé.",
  UNSEND: "Thu hồi",
  UNSENT: "Tin nhắn đã được thu hồi",
  SEEN: "Đã xem",
  PLACEHOLDER: "Nhập tin nhắn...",
  ARCHIVED_NOTE: "Tin nhắn cũ với bạn bè chỉ để xem lại.",
  INBOX_TITLE: "Nhắn tin",
  NO_MESSAGES: "Chưa có tin nhắn. Hãy chào bạn mình nhé.",
} as const;
