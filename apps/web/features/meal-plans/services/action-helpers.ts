import { MEAL_PLAN_MESSAGES } from "@pt/contracts";
import type { z } from "zod";

import type { ApiOutcome } from "@/services/api/call";
import type { ActionErrorResult, ActionResult } from "@/types/error";

// Shared by the PT's meal plan actions and the trainee's meal log actions.
export const fail = (message: string): ActionErrorResult => ({
  status: "error",
  message,
});

export const ok: ActionResult = { status: "success" };

// Zod failures are the caller's input problem, not a server error: a plain
// message, not the generic one with a reference.
export const read = <Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
) => {
  const parsed = schema.safeParse(input);

  return parsed.success
    ? ({ data: parsed.data as z.output<Schema> } as const)
    : ({ error: fail(MEAL_PLAN_MESSAGES.INVALID_INPUT) } as const);
};

// A refused API request (4xx) is an expected branch of these actions: the API
// chose its message for the user (the same text the web used to show).
export const toResult = (outcome: ApiOutcome<unknown>): ActionResult =>
  outcome.ok ? ok : fail(outcome.error.message);
