import { CHAT_PAGE_SIZE } from "../chat/constants.js";

// Group chat (company/main docs/specs/group-chat.md): named chats of trainees,
// PTs and every super admin.

// Explicit members only (trainees and PTs); super admins are implicit (G9).
export const GROUP_MEMBER_CAP = 50;
export const GROUP_NAME_MIN_LENGTH = 1;
export const GROUP_NAME_MAX_LENGTH = 60;
export const GROUP_PAGE_SIZE = CHAT_PAGE_SIZE;
// Ids one create / add request may name (twice the cap: a bad id is skipped
// with its own result, the rest still count).
export const GROUP_ADD_MAX_IDS = GROUP_MEMBER_CAP * 2;

export const GROUP_ROLES = ["super_admin", "pt", "trainee"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const GROUP_SENDER_TAGS = ["manager", "pt"] as const;
export type GroupSenderTag = (typeof GROUP_SENDER_TAGS)[number];

// Server messages are Vietnamese (the web shows them as they come); the codes
// let a client pick its own text.
export const GROUP_MESSAGES = {
  GROUP_NOT_FOUND: "Không tìm thấy nhóm chat này",
  INVALID_INPUT: "Thông tin nhóm không hợp lệ",
  NAME_INVALID: "Tên nhóm cần từ 1 đến 60 ký tự",
  MANAGERS_ONLY: "Nhóm này chỉ cho quản lý nhắn tin",
  GROUP_FULL: "Nhóm đã đủ 50 thành viên",
  NOT_MANAGER: "Bạn không quản lý được nhóm này",
  MANAGER_CANNOT_LEAVE: "Quản lý tổng không thể rời nhóm",
  MEMBER_NOT_FOUND: "Không tìm thấy thành viên này trong nhóm",
  CANNOT_REMOVE_MANAGER: "Không thể xoá quản lý tổng khỏi nhóm",
  ALERT_NOT_FOUND: "Không tìm thấy cảnh báo này",
  ALERT_HANDLED: "Cảnh báo này đã được xử lý",
} as const;

export const GROUP_ERROR_CODES = {
  GROUP_NOT_FOUND: "GROUP_NOT_FOUND",
  NAME_INVALID: "GROUP_NAME_INVALID",
  MANAGERS_ONLY: "GROUP_MANAGERS_ONLY",
  GROUP_FULL: "GROUP_FULL",
  NOT_MANAGER: "GROUP_NOT_MANAGER",
  MANAGER_CANNOT_LEAVE: "GROUP_MANAGER_CANNOT_LEAVE",
  MEMBER_NOT_FOUND: "GROUP_MEMBER_NOT_FOUND",
  CANNOT_REMOVE_MANAGER: "GROUP_CANNOT_REMOVE_MANAGER",
  ALERT_NOT_FOUND: "GROUP_ALERT_NOT_FOUND",
  ALERT_HANDLED: "GROUP_ALERT_HANDLED",
} as const;

// Where a push or a link opens, as the web routes.
export const groupUserPath = (groupId: number) => `/messages/groups/${groupId}`;
export const groupAdminPath = (groupId: number) =>
  `/admin/messages/groups/${groupId}`;
// One notification per group: a newer one replaces the older; an open group
// thread clears it.
export const groupPushTag = (groupId: number) => `chat-group-${groupId}`;
