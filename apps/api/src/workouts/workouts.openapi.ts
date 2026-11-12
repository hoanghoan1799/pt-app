import { applyDecorators } from "@nestjs/common";
import { ApiParam, ApiQuery } from "@nestjs/swagger";

// `@Param({ schema })` / `@Query({ schema })` validate the whole object, so
// Swagger cannot see the individual names; these declare them for the docs.
export const ApiPathParams = (...names: string[]) =>
  applyDecorators(...names.map((name) => ApiParam({ name, type: String })));

export const ApiQueries = (
  ...queries: { name: string; required?: boolean; description?: string }[]
) =>
  applyDecorators(
    ...queries.map((query) =>
      ApiQuery({
        name: query.name,
        required: query.required ?? false,
        description: query.description,
        type: String,
      }),
    ),
  );
