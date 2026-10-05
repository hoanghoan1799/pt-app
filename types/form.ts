export interface FormState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  // Echoed back so uncontrolled inputs keep what was typed after a failed submit.
  values?: Partial<Record<string, string>>;
  // Set when the failure was unexpected (server/config): an id to quote to
  // support that matches the "[pt-app] … failed" line in the server logs.
  errorReference?: string;
  // Changes on every response so effects can react to repeated successes.
  submittedAt?: number;
}
