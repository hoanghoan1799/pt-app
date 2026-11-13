import type { FormState } from "@/types/form";
import { createErrorState } from "@/utils/form";

// Pure (no `server-only`): the error type and its mappers are shared by the
// server helpers, action-errors and unit tests.

export type ApiErrorKind = "http" | "timeout" | "network";

export type ApiErrorInit = {
  kind?: ApiErrorKind;
  // HTTP status; 0 when no response arrived (timeout, network).
  status: number;
  // Stable API code, e.g. "INVALID_CREDENTIALS", "ADMIN_LOCKED".
  code: string;
  // For 4xx: text the API chose for the user. For 5xx/network: generic.
  message: string;
  // Id of the API log line that holds the real cause.
  ref?: string;
  // Flat extra facts the API exposes on a 4xx (e.g. attemptsLeft).
  details?: Record<string, string | number | boolean>;
  method?: string;
  path?: string;
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly ref?: string;
  readonly details?: Record<string, string | number | boolean>;
  readonly method?: string;
  readonly path?: string;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.kind = init.kind ?? "http";
    this.status = init.status;
    this.code = init.code;
    this.ref = init.ref;
    this.details = init.details;
    this.method = init.method;
    this.path = init.path;
  }

  // A 4xx: the request was refused for a reason the user can act on, and
  // `message` is safe to show. 5xx, timeouts and network failures are not.
  get isClientError() {
    return this.kind === "http" && this.status >= 400 && this.status < 500;
  }

  // The same message the UI shows, when the API left field errors in it.
  get fieldErrors() {
    return this.code === "VALIDATION_FAILED"
      ? parseValidationMessage(this.message)
      : undefined;
  }
}

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof ApiError;

export const API_CODES = {
  SESSION_INVALID: "SESSION_INVALID",
  UNAUTHORIZED: "UNAUTHORIZED",
  ADMIN_LOCKED: "ADMIN_LOCKED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNREACHABLE: "API_UNREACHABLE",
  TIMEOUT: "API_TIMEOUT",
} as const;

// The 401 codes that mean "this session is over" (as opposed to wrong
// credentials or the fifth wrong passcode, which have their own codes).
export const isSessionEndedError = (error: ApiError) =>
  error.status === 401 &&
  (error.code === API_CODES.SESSION_INVALID ||
    error.code === API_CODES.UNAUTHORIZED);

export const isAdminLockedError = (error: ApiError) =>
  error.status === 403 && error.code === API_CODES.ADMIN_LOCKED;

// The API's validation failure is one message: "path: text; path.2: text".
// First segment of the path is the form field. Best effort: a message that does
// not look like that yields no field errors.
const VALIDATION_PART = /^([A-Za-z_][\w.[\]-]*): (.+)$/;

export const parseValidationMessage = (message: string) => {
  const fieldErrors: Partial<Record<string, string>> = {};

  for (const part of message.split("; ")) {
    const match = VALIDATION_PART.exec(part);

    if (match) {
      const field = match[1].split(/[.[]/)[0];

      fieldErrors[field] ??= match[2];
    }
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
};

// Builds an ApiError from a non-2xx response body (`{code,message,ref,details}`).
// Anything that does not look like that becomes a generic error for the status.
export const apiErrorFromBody = (
  status: number,
  body: unknown,
  context: { method?: string; path?: string } = {},
) => {
  const fields =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const details =
    typeof fields.details === "object" &&
    fields.details !== null &&
    !Array.isArray(fields.details)
      ? (fields.details as ApiErrorInit["details"])
      : undefined;

  return new ApiError({
    status,
    code: typeof fields.code === "string" ? fields.code : `HTTP_${status}`,
    message:
      typeof fields.message === "string" && fields.message
        ? fields.message
        : `HTTP ${status}`,
    ref: typeof fields.ref === "string" ? fields.ref : undefined,
    details,
    ...context,
  });
};

// Form actions: turn a refused request into the message and field errors the
// form shows. Pass what the user typed in `extra.values` to keep it.
export const apiErrorToFormState = (
  error: ApiError,
  extra: Omit<FormState, "status" | "message"> = {},
): FormState =>
  createErrorState(error.message, {
    fieldErrors: error.fieldErrors,
    ...extra,
  });
