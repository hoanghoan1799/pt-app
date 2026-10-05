export type ErrorCode =
  | "CONFIG_MISSING"
  | "CONFIG_INVALID"
  | "DB_FILE_UNAVAILABLE"
  | "DB_NOT_MIGRATED"
  | "DB_AUTH_FAILED"
  | "DB_UNREACHABLE"
  | "UNKNOWN";

export interface ClassifiedError {
  code: ErrorCode;
  // Technical detail for logs and /api/health; never contains secrets.
  detail: string;
}

export type ActionResult =
  | { status: "success" }
  | { status: "error"; message: string; reference?: string };
