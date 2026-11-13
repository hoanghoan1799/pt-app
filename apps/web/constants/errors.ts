import type { ErrorCode } from "@/types/error";

// The only text users see for unexpected errors in production; technical
// causes stay in the server logs (see services/action-errors.ts).
export const GENERIC_ERROR_MESSAGE = "Đã có lỗi xảy ra. Vui lòng thử lại sau.";

export const ERROR_REFERENCE_LENGTH = 8;

// What went wrong, for developers: shown in development, the logs and the
// token-protected /api/health — never to users in production.
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  CONFIG_MISSING: "Server chưa được cấu hình đủ biến môi trường",
  CONFIG_INVALID: "Biến môi trường trên server không hợp lệ",
  API_UNREACHABLE: "Server không kết nối được tới API (kiểm tra API_URL)",
  API_TIMEOUT: "API không trả lời kịp thời gian cho phép",
  UNKNOWN: "Đã có lỗi không mong muốn trên server",
};

export const REQUIRED_ENV = {
  API_URL: "API_URL",
} as const;
