import { DB_ERROR_PATTERNS, ERROR_MESSAGES } from "@/constants/errors";
import { describeReferenceFor } from "@/i18n/localize-message";
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

// True when the database refused a write because of a UNIQUE index or key.
export const isUniqueViolation = (error: unknown) =>
  collectMessages(error).some((message) =>
    /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(message),
  );
