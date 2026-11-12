import type { INestApplication } from "@nestjs/common";

export const API_PREFIX = "v1";

// Shared by main.ts and the e2e tests so both see the same routes.
export const configureApp = (app: INestApplication) => {
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
};
