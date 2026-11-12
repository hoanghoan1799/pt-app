import type { ApiResponseSchemaHost } from "@nestjs/swagger";
import { z } from "zod";

type OpenApiSchema = ApiResponseSchemaHost["schema"];

// Turns a Zod schema into the JSON Schema object Swagger decorators accept,
// so the contract is written once in Zod and documented from the same source.
export const toOpenApiSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, {
    target: "openapi-3.0",
    io: "output",
  }) as OpenApiSchema;
