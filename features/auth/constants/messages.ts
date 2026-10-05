export const AUTH_MESSAGES = {
  NAME_REQUIRED: "Vui lòng nhập tên của bạn",
  NAME_NOT_FOUND:
    "Không tìm thấy tên này. Hãy nhập đúng tên mà PT đã tạo cho bạn.",
  PASSWORD_REQUIRED: "Vui lòng nhập mật khẩu",
  PASSWORD_WRONG: "Mật khẩu không đúng",
  ADMIN_NOT_CONFIGURED: "Chưa cấu hình ADMIN_PASSWORD trên server",
} as const;

// Slows down password guessing on the single shared admin password.
export const LOGIN_FAILURE_DELAY_MS = 600;
