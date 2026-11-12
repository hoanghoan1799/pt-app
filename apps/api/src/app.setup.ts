import {
  BadRequestException,
  type INestApplication,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { APP_ENV } from "./config/app-config.module.js";
import type { Env } from "./config/env.schema.js";

export const API_PREFIX = "v1";
export const DOCS_PATH = `${API_PREFIX}/docs`;

// Zod schemas from @pt/contracts are attached to routes (`@Body({ schema })`);
// a failure becomes a 400 with the paths and messages, never the values.
const validationPipe = () =>
  new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new BadRequestException({
        code: "VALIDATION_FAILED",
        message: issues
          .map((issue) => {
            const path = issue.path
              ?.map((part) =>
                String(typeof part === "object" ? part.key : part),
              )
              .join(".");

            return path ? `${path}: ${issue.message}` : issue.message;
          })
          .join("; "),
      }),
  });

export const buildOpenApiConfig = () =>
  new DocumentBuilder()
    .setTitle("PT App API")
    .setDescription("REST API under /v1. Additive changes only.")
    .setVersion("1")
    .addBearerAuth()
    .build();

// The OpenAPI document, shared by Swagger UI, `pnpm openapi` and the test that
// fails when apps/api/openapi.json is stale.
export const buildOpenApiDocument = (app: INestApplication) =>
  SwaggerModule.createDocument(app, buildOpenApiConfig());

// Swagger UI is a development aid: it is never mounted in production.
const setupSwagger = (app: INestApplication) => {
  SwaggerModule.setup(DOCS_PATH, app, buildOpenApiDocument(app));
};

// Shared by main.ts and the e2e tests so both see the same routes.
export const configureApp = (app: INestApplication) => {
  const env = app.get<Env>(APP_ENV);

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(app.get(AllExceptionsFilter));
  app.useGlobalPipes(validationPipe());
  app.enableShutdownHooks();

  if (env.NODE_ENV !== "production") {
    setupSwagger(app);
  }
};
