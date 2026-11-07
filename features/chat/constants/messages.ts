export const CHAT_MESSAGES = {
  USER_NOT_FOUND: "Không tìm thấy user này",
  CHAT_LOCKED: "PT đã tạm khoá nhắn tin",
  ADMIN_CHAT_LOCKED: "Chat đang bị khoá. Bật lại để nhắn tin.",
  CONVERSATION_NOT_FOUND: "Không tìm thấy cuộc trò chuyện",
  INVALID_INPUT: "Tin nhắn không hợp lệ",
  MESSAGE_NOT_FOUND: "Không tìm thấy tin nhắn",
  NOT_YOUR_MESSAGE: "Bạn chỉ thao tác được trên tin nhắn của mình",
  NICKNAME_INVALID: "Biệt danh không hợp lệ (tối đa 30 ký tự)",
  COLOR_INVALID: "Màu không hợp lệ",
  ADMIN_NOT_FOUND: "Không tìm thấy PT này",
  STICKER_NOT_EDITABLE: "Không sửa được sticker",
  MESSAGE_UNSENT: "Tin nhắn đã bị thu hồi",
} as const;

export const HIDDEN_CHAT_MESSAGES = {
  PASSCODE_REQUIRED: "Hãy đặt mã khoá trước khi ẩn học viên.",
  INVALID_INPUT: "Học viên không hợp lệ",
  NO_MATCH: "Không khớp",
} as const;
