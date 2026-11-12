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

export interface ActionErrorResult {
  status: "error";
  message: string;
  reference?: string;
}

export type ActionResult = { status: "success" } | ActionErrorResult;

// Saving an exercise's sets also reports a new personal best (KAN-27, D5).
export type SaveSetsResult =
  { status: "success"; personalBest: boolean } | ActionErrorResult;

// Deleting an exercise whose sets the PT was not warned about is refused (KAN-51).
export type DeleteExerciseResult =
  { status: "success" } | { status: "needs-confirm" } | ActionErrorResult;
