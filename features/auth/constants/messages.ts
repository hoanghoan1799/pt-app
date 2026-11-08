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
  PASSWORD_CHANGED_TOAST: "Đã đổi mật khẩu. Thiết bị khác đã bị đăng xuất.",
  PASSCODE_INVALID: "Mã khoá gồm đúng 4 chữ số",
  PASSCODE_ALREADY_SET: "Đã có mã khoá. Hãy đổi mã khoá thay vì đặt mới.",
  PASSCODE_NOT_SET: "Chưa đặt mã khoá",
  PASSCODE_WRONG: "Mã khoá không đúng",
  PASSCODE_SIGNED_OUT: "Nhập sai mã khoá quá nhiều lần. Bạn đã bị đăng xuất.",
  PASSCODE_SAME: "Mã khoá mới phải khác mã khoá hiện tại",
  PASSCODE_HAS_HIDDEN_CHATS:
    "Hãy bỏ ẩn các học viên đã ẩn trước khi tắt mã khoá",
  PASSCODE_RESET_PASSWORD_WRONG: "Mật khẩu không đúng",
} as const;

// Slows down password guessing on admin accounts.
export const LOGIN_FAILURE_DELAY_MS = 600;
