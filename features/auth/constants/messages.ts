export const AUTH_MESSAGES = {
  CREDENTIALS_REQUIRED: "Nhập tài khoản và mật khẩu",
  CREDENTIALS_WRONG: "Sai tài khoản hoặc mật khẩu",
  EMAIL_CREDENTIALS_REQUIRED: "Nhập email và mật khẩu",
  EMAIL_LOGIN_WRONG: "Sai email hoặc mật khẩu",
  LOGIN_LOCKED: "Đăng nhập sai quá nhiều lần. Thử lại sau 15 phút.",
  CURRENT_PASSWORD_REQUIRED: "Nhập mật khẩu hiện tại",
  CURRENT_PASSWORD_WRONG: "Mật khẩu hiện tại không đúng",
  NEW_PASSWORD_TOO_SHORT: "Mật khẩu mới tối thiểu 8 ký tự",
  NEW_PASSWORD_TOO_LONG: "Mật khẩu mới tối đa 128 ký tự",
  NEW_PASSWORD_SAME: "Mật khẩu mới phải khác mật khẩu hiện tại",
  CONFIRM_MISMATCH: "Mật khẩu nhập lại không khớp",
  PASSWORD_CHANGED: "Đã đổi mật khẩu",
} as const;

// Slows down password guessing on admin accounts.
export const LOGIN_FAILURE_DELAY_MS = 600;
