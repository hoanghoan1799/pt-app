export const AUTH_MESSAGES = {
  NAME_REQUIRED: "Vui lòng nhập tên của bạn",
  NAME_NOT_FOUND:
    "Không tìm thấy tên này. Hãy nhập đúng tên mà PT đã tạo cho bạn.",
  CREDENTIALS_REQUIRED: "Nhập tài khoản và mật khẩu",
  CREDENTIALS_WRONG: "Sai tài khoản hoặc mật khẩu",
} as const;

// Slows down password guessing on admin accounts.
export const LOGIN_FAILURE_DELAY_MS = 600;

// localStorage key holding the last signed-in name, used to pre-fill the
// login form if the session cookie is ever lost.
export const REMEMBERED_NAME_KEY = "pt-app:last-name";
