import { ERROR_MESSAGES } from "@/constants/errors";
import { describeReferenceFor } from "@/i18n/localize-message";
import { ApiError } from "@/services/api/errors";
import type { ClassifiedError, ErrorCode } from "@/types/error";
import { type Locale, parseLocale } from "@/utils/locale";

// An error we raise on purpose, already carrying its code.
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, detail: string) {
    super(detail);
    this.name = "AppError";
    this.code = code;
  }
}

// Walks `cause` so the detail keeps the whole chain of an error.
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
  if (error instanceof ApiError) {
    return {
      code:
        error.kind === "timeout"
          ? "API_TIMEOUT"
          : error.kind === "network"
            ? "API_UNREACHABLE"
            : "UNKNOWN",
      // Never the token or the body: method, path, status, API code, API ref.
      detail:
        `API ${error.method ?? ""} ${error.path ?? ""} -> ${error.status} ${error.code} ref=${error.ref ?? "-"}`.replace(
          /\s+/g,
          " ",
        ),
    };
  }

  return {
    code: "UNKNOWN",
    detail: collectMessages(error).join(" | ") || "Unknown error",
  };
};

export const getErrorMessage = ({ code }: ClassifiedError) =>
  ERROR_MESSAGES[code];

// The language the page is in (<html lang>), for code that runs in the browser
// without a locale at hand; Vietnamese on the server and in tests.
const getPageLocale = () =>
  parseLocale(
    typeof document === "undefined" ? undefined : document.documentElement.lang,
  );

// Secondary line under an error message, e.g. "Mã tham chiếu: 3f9a1c2e".
export const describeErrorReference = (
  reference: string | undefined,
  locale: Locale = getPageLocale(),
) => (reference ? describeReferenceFor(locale, reference) : undefined);
