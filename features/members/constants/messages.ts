export const MEMBER_NAME_MAX_LENGTH = 60;

export const MEMBER_MESSAGES = {
  NAME_REQUIRED: "Nhập tên user",
  NAME_TOO_LONG: `Tên tối đa ${MEMBER_NAME_MAX_LENGTH} ký tự`,
  NAME_TAKEN: "Tên này đã có. Thêm họ hoặc ký tự để phân biệt.",
  EMAIL_TAKEN: "Email này đã được dùng",
  NOT_FOUND: "Không tìm thấy user này",
  NO_LOGIN: "User này chưa có đăng nhập. Hãy đặt email trước.",
  DELETE_CONFIRM:
    "Xóa user này và toàn bộ lịch tập của họ? Thao tác không thể hoàn tác.",
} as const;
