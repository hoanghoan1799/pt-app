export const DM_BODY_MAX_LENGTH = 2000;
export const DM_PAGE_SIZE = 50;
export const DM_POLL_MS = 5000;
// Photos use the same 400 KB target as post photos.
export { POST_PHOTO_MAX_BYTES as DM_PHOTO_MAX_BYTES } from "@/features/social/constants/social";

export const DM_COACH_TITLE = "Huấn luyện viên";

export const DM_MESSAGES = {
  NOT_FOUND: "Không tìm thấy cuộc trò chuyện.",
  READ_ONLY: "Hai bạn không còn là bạn bè, nên không thể nhắn tin thêm.",
  READ_ONLY_OTHER_TERMS:
    "Người này chưa đồng ý Điều khoản sử dụng, nên chưa thể nhắn tin.",
  EMPTY: "Hãy viết tin nhắn hoặc chọn một ảnh.",
  TOO_LONG: `Tin nhắn tối đa ${DM_BODY_MAX_LENGTH} ký tự.`,
  PHOTO_NOT_FOUND: "Không tìm thấy ảnh. Hãy chọn lại ảnh.",
  SEND_FAILED: "Không gửi được tin nhắn. Thử lại nhé.",
  UNSEND: "Thu hồi",
  UNSENT: "Tin nhắn đã được thu hồi",
  SEEN: "Đã xem",
  MESSAGE_FRIEND: "Nhắn tin",
  PLACEHOLDER: "Nhập tin nhắn...",
  EMPTY_INBOX:
    "Chưa có cuộc trò chuyện với bạn bè. Mở trang bạn bè để bắt đầu.",
  INBOX_TITLE: "Nhắn tin",
  NO_MESSAGES: "Chưa có tin nhắn. Hãy chào bạn mình nhé.",
} as const;
