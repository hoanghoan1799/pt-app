// A super admin's block on a trainee (company/main "admin block user", spec
// docs/specs/admin-block-user.md there). "restricted" refuses chat, social and
// friend writes; "suspended" also refuses login and hides the trainee from
// other trainees.
export const RESTRICTION_LEVELS = ["restricted", "suspended"] as const;

// How long a block lasts; "permanent" has no end date (D5).
export const RESTRICTION_DURATIONS = ["24h", "7d", "30d", "permanent"] as const;

// D9: the reason is required, trimmed, at most 300 characters.
export const RESTRICTION_REASON_MAX = 300;

const HOUR_MS = 60 * 60 * 1000;

// Milliseconds added to "now" for each timed duration.
export const RESTRICTION_DURATION_MS = {
  "24h": 24 * HOUR_MS,
  "7d": 7 * 24 * HOUR_MS,
  "30d": 30 * 24 * HOUR_MS,
} as const;

// Vietnamese, like every API message: the web's `errors` namespace maps them
// to the active locale (errors.json "restriction" group).
export const RESTRICTION_MESSAGES = {
  RESTRICTED:
    "Tài khoản của bạn đang bị hạn chế, nên chưa thể thực hiện thao tác này.",
  USER_NOT_FOUND: "Không tìm thấy học viên cần chặn",
  INVALID_INPUT: "Thông tin chặn không hợp lệ",
  REASON_REQUIRED: "Hãy nhập lý do chặn",
  REASON_TOO_LONG: "Lý do chặn tối đa 300 ký tự",
  NOT_RESTRICTED: "Học viên này hiện không bị chặn",
} as const;

// Error codes of the restriction refusals (`{ code, message }` bodies).
export const RESTRICTION_ERROR_CODES = {
  // A restricted trainee tried a guarded write (403).
  RESTRICTED: "RESTRICTED",
  // A suspended trainee gave the right password (403, details: until, reason).
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  // Lift with no active block (409).
  NOT_RESTRICTED: "NOT_RESTRICTED",
} as const;
