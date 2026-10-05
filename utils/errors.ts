import { DB_ERROR_PATTERNS, ERROR_MESSAGES } from "@/constants/errors";
import type { ClassifiedError, ErrorCode } from "@/types/error";

// An error we raise on purpose, already carrying its code.
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, detail: string) {
    super(detail);
    this.name = "AppError";
    this.code = code;
  }
}

// libsql/drizzle wrap the driver error in `cause`, so read the whole chain.
const collectMessages = (error: unknown, depth = 0): string[] => {
  if (!(error instanceof Error) || depth > 5) {
    return error === undefined || error === null ? [] : [String(error)];
  }

  const code =
    "code" in error && typeof error.code === "string" ? [error.code] : [];

  return [...code, error.message, ...collectMessages(error.cause, depth + 1)];
};

export const classifyError = (error: unknown): ClassifiedError => {
  if (error instanceof AppError) {
    return { code: error.code, detail: error.message };
  }

  const detail = collectMessages(error).join(" | ") || "Unknown error";
  const match = DB_ERROR_PATTERNS.find(([, pattern]) => pattern.test(detail));

  return { code: match?.[0] ?? "UNKNOWN", detail };
};

export const getErrorMessage = ({ code }: ClassifiedError) =>
  ERROR_MESSAGES[code];

// Secondary line under an error message, e.g. "Mã tham chiếu: 3f9a1c2e".
export const describeErrorReference = (reference: string | undefined) =>
  reference ? `Mã tham chiếu: ${reference}` : undefined;
