// Framework-free auth constants shared by the API, the web app and a future
// mobile app. Values mirror the current web rules (apps/web/constants).

export const CLIENT_KINDS = ["web", "ios", "android"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export const ADMIN_ROLES = ["super_admin", "pt"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

// What a signed-in actor is for authorization: a trainee or one of the admin
// roles.
export const ACTOR_ROLES = ["super_admin", "pt", "trainee"] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

// 5 failures inside 15 minutes lock the key for 15 minutes (KAN-82, D9).
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

export const PASSCODE_LENGTH = 4;
// This many wrong passcodes in a row sign the admin out (KAN-160, Q5).
export const PASSCODE_MAX_FAILS = 5;
// An unlock stays valid for 5 minutes without activity.
export const UNLOCK_WINDOW_SECONDS = 300;
// A reveal of hidden trainees is a fixed 10 minute window (KAN-163).
export const REVEAL_WINDOW_SECONDS = 10 * 60;

export const USER_PASSWORD_MIN = 8;
export const USER_PASSWORD_MAX = 128;
export const MIN_ADMIN_PASSWORD_LENGTH = 8;
// Admin usernames: letters, digits, dot, dash and underscore; 3-32 characters.
export const ADMIN_USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

export const EMAIL_MAX_LENGTH = 254;
// Upper bound of what a login form may send; keeps scrypt work bounded.
export const LOGIN_PASSWORD_MAX = 1024;
export const CLIENT_NAME_MAX = 100;

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
  PASSCODE_INVALID: "Mã khoá gồm đúng 4 chữ số",
  PASSCODE_ALREADY_SET: "Đã có mã khoá. Hãy đổi mã khoá thay vì đặt mới.",
  PASSCODE_NOT_SET: "Chưa đặt mã khoá",
  PASSCODE_WRONG: "Mã khoá không đúng",
  PASSCODE_SIGNED_OUT: "Nhập sai mã khoá quá nhiều lần. Bạn đã bị đăng xuất.",
  PASSCODE_SAME: "Mã khoá mới phải khác mã khoá hiện tại",
  PASSCODE_HAS_HIDDEN_CHATS:
    "Hãy bỏ ẩn các học viên đã ẩn trước khi tắt mã khoá",
  PASSCODE_RESET_PASSWORD_WRONG: "Mật khẩu không đúng",
  ADMIN_LOCKED: "Nhập mã khoá để tiếp tục",
  SESSION_INVALID: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn",
  SESSION_NOT_FOUND: "Không tìm thấy phiên đăng nhập",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này",
  TRAINEE_NOT_FOUND: "Không tìm thấy học viên",
} as const;

// Wrong attempts left before sign-out, never below 0.
export const attemptsLeft = (failedCount: number) =>
  Math.max(0, PASSCODE_MAX_FAILS - failedCount);

// True when `failedCount` (already including the latest wrong attempt) means
// the admin must be signed out.
export const shouldSignOut = (failedCount: number) =>
  failedCount >= PASSCODE_MAX_FAILS;

// Null role = super admin (admins created before roles existed).
export const toAdminRole = (role: string | null | undefined): AdminRole =>
  role === "pt" ? "pt" : "super_admin";
