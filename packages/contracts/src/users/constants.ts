// Constants of the users, PT, admin-profile and avatar endpoints. Messages and
// limits mirror the web app (members, pts, avatar, contact-aliases, chat).

export const MEMBER_NAME_MAX_LENGTH = 60;

export const MEMBER_MESSAGES = {
  NAME_REQUIRED: "Nhập tên user",
  NAME_TOO_LONG: `Tên tối đa ${MEMBER_NAME_MAX_LENGTH} ký tự`,
  NAME_TAKEN: "Tên này đã có. Thêm họ hoặc ký tự để phân biệt.",
  EMAIL_TAKEN: "Email này đã được dùng",
  NOT_FOUND: "Không tìm thấy user này",
  NO_LOGIN: "User này chưa có đăng nhập. Hãy đặt email trước.",
  PASSWORD_ONCE: "Mật khẩu chỉ hiện một lần. Hãy gửi cho học viên ngay.",
} as const;

export const EMAIL_MESSAGES = {
  REQUIRED: "Nhập email",
  INVALID: "Email không hợp lệ",
  TOO_LONG: "Email tối đa 254 ký tự",
} as const;

export const PT_MESSAGES = {
  USERNAME_INVALID:
    "Tên đăng nhập 3–32 ký tự, chỉ gồm chữ, số, dấu chấm, gạch ngang, gạch dưới",
  PASSWORD_TOO_SHORT: "Mật khẩu cần ít nhất 8 ký tự",
  PASSWORD_TOO_LONG: "Mật khẩu tối đa 128 ký tự",
  USERNAME_TAKEN: "Tên đăng nhập này đã được dùng",
  CREATED: "Đã tạo tài khoản PT",
  ADMIN_NOT_FOUND: "Không tìm thấy tài khoản",
  USER_NOT_FOUND: "Không tìm thấy học viên",
  PT_NOT_FOUND: "Không tìm thấy PT",
} as const;

// Profile photos (KAN-157): the browser crops to 256x256 and sends a data URL.
export const AVATAR_SIZE_PX = 256;
// Decoded image bytes; a 256x256 photo at quality 0.8 is about 15-30 KB.
export const AVATAR_MAX_BYTES = 80 * 1024;
// base64 is 4/3 larger, plus the "data:image/webp;base64," prefix.
export const AVATAR_MAX_DATA_URL_LENGTH =
  Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 64;
export const AVATAR_MIME_TYPES = [
  "image/webp",
  "image/jpeg",
  "image/png",
] as const;
export type AvatarMime = (typeof AVATAR_MIME_TYPES)[number];
export const AVATAR_KINDS = ["user", "admin"] as const;
export type AvatarKind = (typeof AVATAR_KINDS)[number];

export const AVATAR_MESSAGES = {
  INVALID: "Ảnh không hợp lệ. Chọn ảnh JPEG, PNG hoặc WebP.",
  TOO_LARGE: "Ảnh quá lớn. Chọn ảnh nhỏ hơn.",
} as const;

// Private nicknames (contact aliases).
export const ALIAS_MAX_LENGTH = 30;
export const PT_ALIAS_TARGET = "pt";

export const ALIAS_MESSAGES = {
  INVALID: "Biệt danh không hợp lệ (tối đa 30 ký tự)",
  SELF: "Bạn không thể đặt biệt danh cho chính mình",
  TARGET_NOT_FOUND: "Không tìm thấy người này",
} as const;

export const HIDDEN_USERS_MESSAGES = {
  PASSCODE_REQUIRED: "Hãy đặt mã khoá trước khi ẩn học viên.",
  INVALID_INPUT: "Học viên không hợp lệ",
} as const;
export const HIDE_USERS_MAX = 100;

export const PRESENCE_MESSAGES = { INVALID: "Giá trị không hợp lệ" } as const;

// Bubble colours of the chat palette (keys only; hex values are UI).
export const CHAT_COLOR_KEYS = [
  "orange",
  "red",
  "pink",
  "purple",
  "indigo",
  "blue",
  "teal",
  "green",
] as const;
export type ChatColorKey = (typeof CHAT_COLOR_KEYS)[number];

export const PROFILE_MESSAGES = {
  COLOR_INVALID: "Màu không hợp lệ",
  CHAT_LOCKED: "PT đã tạm khoá nhắn tin",
  LOCALE_INVALID: "Ngôn ngữ không hợp lệ",
  TERMS_REQUIRED:
    "Bạn cần đồng ý Điều khoản sử dụng trước khi dùng tính năng này.",
  BIO_TOO_LONG: "Giới thiệu tối đa 150 ký tự.",
  USER_NOT_FOUND: "Không tìm thấy user này",
  ADMIN_NOT_FOUND: "Không tìm thấy PT này",
} as const;

export const BIO_MAX_LENGTH = 150;

export const APP_LOCALES = ["vi", "en", "zh"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
