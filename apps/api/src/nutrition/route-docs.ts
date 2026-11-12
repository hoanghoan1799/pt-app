import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse } from "@nestjs/swagger";
import type { z } from "zod";

import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";

// OpenAPI for one route from its Zod schemas, so the contract is written once.
export const ApiRoute = (options: {
  summary: string;
  body?: z.ZodType;
  response?: z.ZodType;
  status?: number;
  errors?: number[];
}) =>
  applyDecorators(
    ApiOperation({ summary: options.summary }),
    ...(options.body
      ? [ApiBody({ schema: toOpenApiSchema(options.body, "input") })]
      : []),
    ApiResponse({
      status: options.status ?? 200,
      description: options.response ? "OK" : "No content",
      ...(options.response
        ? { schema: toOpenApiSchema(options.response) }
        : {}),
    }),
    ApiErrors(...(options.errors ?? [400, 401, 403])),
  );
