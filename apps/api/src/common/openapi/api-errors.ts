import { applyDecorators } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import { errorResponseSchema } from "@pt/contracts";

import { toOpenApiSchema } from "./zod-schema.js";

const errorSchema = toOpenApiSchema(errorResponseSchema);

const DESCRIPTIONS: Record<number, string> = {
  400: "Invalid input",
  401: "Missing, invalid or expired session, or wrong credentials",
  403: "Not allowed (role, passcode lock or wrong passcode)",
  404: "Not found (also: outside the PT workspace or hidden)",
  409: "Conflict with the current state",
  429: "Too many requests or login locked",
};

// Documents the shared `{ code, message, ref }` error body per status.
export const ApiErrors = (...statuses: number[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status] ?? "Error",
        schema: errorSchema,
      }),
    ),
  );
