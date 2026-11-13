// Framework-free chat constants and messages, shared by the API, the web app
// and a future mobile app. Values mirror apps/web/features/chat (the spec).

export const CHAT_PAGE_SIZE = 30;
export const CHAT_BODY_MAX_LENGTH = 2000;
export const CHAT_PREVIEW_LENGTH = 80;
export const CHAT_REPLY_SNIPPET_LENGTH = 120;
// Edited / unsent / reacted messages returned per poll.
export const CHAT_CHANGES_PAGE_SIZE = 200;
// The most messages after a jump target one request loads.
export const CHAT_JUMP_MAX_NEWER = 500;

// Reader / reactor keys of chat_reads and chat_reactions.
export const CHAT_USER_READER_KEY = "user";
export const chatAdminReaderKey = (adminId: number) => `admin:${adminId}`;

export const CHAT_REACTION_EMOJIS = [
  "❤️",
  "😂",
  "😮",
  "😢",
  "💪",
  "👍",
] as const;
export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

export const CHAT_MESSAGES = {
  USER_NOT_FOUND: "Không tìm thấy user này",
  CHAT_LOCKED: "PT đã tạm khoá nhắn tin",
  ADMIN_CHAT_LOCKED: "Chat đang bị khoá. Bật lại để nhắn tin.",
  CONVERSATION_NOT_FOUND: "Không tìm thấy cuộc trò chuyện",
  INVALID_INPUT: "Tin nhắn không hợp lệ",
  MESSAGE_NOT_FOUND: "Không tìm thấy tin nhắn",
  NOT_YOUR_MESSAGE: "Bạn chỉ thao tác được trên tin nhắn của mình",
  COLOR_INVALID: "Màu không hợp lệ",
  STICKER_NOT_EDITABLE: "Không sửa được sticker",
  MESSAGE_UNSENT: "Tin nhắn đã bị thu hồi",
  POST_NOT_FOUND: "Không thể trả lời bài viết này.",
  POST_NEEDS_TEXT: "Hãy viết tin nhắn để trả lời bài viết.",
} as const;

// Photos in chat (KAN-160).
export const CHAT_PHOTO_MAX_BYTES = 1.5 * 1024 * 1024;
export const CHAT_PHOTO_MAX_SIDE = 1600;
// A pending photo (uploaded, never sent) is dropped after this long.
export const CHAT_PHOTO_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export const CHAT_PHOTO_ERRORS = {
  TOO_LARGE: "Ảnh quá lớn. Hãy chọn ảnh khác.",
  BAD_IMAGE: "Chỉ gửi được ảnh JPEG, PNG hoặc WebP. Hãy chọn lại ảnh.",
  NOT_FOUND: "Không tìm thấy ảnh. Hãy chọn lại ảnh.",
  GENERIC: "Không gửi được ảnh. Thử lại nhé.",
} as const;

export const CHAT_PHOTO_MIMES = [
  "image/webp",
  "image/jpeg",
  "image/png",
] as const;
export type ChatPhotoMime = (typeof CHAT_PHOTO_MIMES)[number];

// Personal stickers (KAN-158).
export const STICKER_CUSTOM_MAX_BYTES = 150 * 1024;
export const STICKER_CUSTOM_MAX_PER_OWNER = 100;
export const STICKER_CUSTOM_MIMES = ["image/webp", "image/png"] as const;
export type StickerCustomMime = (typeof STICKER_CUSTOM_MIMES)[number];

export const STICKER_ERRORS = {
  TOO_LARGE: "Ảnh sau khi xử lý vẫn quá lớn. Hãy chọn ảnh khác.",
  BAD_IMAGE: "Chỉ nhận ảnh WebP hoặc PNG đã xử lý. Hãy chọn lại ảnh.",
  LIMIT: `Bạn đã có tối đa ${STICKER_CUSTOM_MAX_PER_OWNER} sticker. Hãy xoá bớt rồi thêm ảnh mới.`,
  NOT_FOUND: "Không tìm thấy sticker.",
  GENERIC: "Không thêm được sticker. Thử lại nhé.",
} as const;

// GIPHY proxy (KAN-144).
export const STICKER_GIPHY_QUERY_MAX_LENGTH = 50;
export const STICKER_GIPHY_RESULT_LIMIT = 24;
// Per viewer; plenty for typing a search, far below the GIPHY free-tier cap.
export const STICKER_GIPHY_RATE_LIMIT = 30;
export const STICKER_GIPHY_RATE_WINDOW_MS = 60_000;
export const STICKER_GIPHY_CACHE_TTL_MS = 5 * 60_000;
export const STICKER_GIPHY_CACHE_MAX_ENTRIES = 100;

// Search inside a conversation (KAN-160).
export const CHAT_SEARCH_MIN_LENGTH = 2;
export const CHAT_SEARCH_MAX_LENGTH = 100;
export const CHAT_SEARCH_PAGE_SIZE = 20;
// Characters of context on each side of the match in a snippet.
export const CHAT_SNIPPET_CONTEXT = 40;

// The gallery of a conversation (KAN-160).
export const CHAT_GALLERY_PAGE_SIZE = 60;
export const CHAT_GALLERY_TABS = ["photos", "stickers", "links"] as const;
export type ChatGalleryTab = (typeof CHAT_GALLERY_TABS)[number];

// Trainee-to-trainee chat: read-only since 2026-11-09.
export const DM_BODY_MAX_LENGTH = 2000;
export const DM_PAGE_SIZE = 50;

export const DM_MESSAGES = {
  NOT_FOUND: "Không tìm thấy cuộc trò chuyện.",
  DISABLED:
    "Học viên không thể nhắn tin với nhau. Bạn chỉ có thể nhắn tin với PT của mình.",
  UNSENT: "Tin nhắn đã được thu hồi",
  TERMS_REQUIRED:
    "Bạn cần đồng ý Điều khoản sử dụng trước khi dùng tính năng này.",
} as const;
