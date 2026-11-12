import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";
import { loadEnv } from "./config/env.schema.js";

const bootstrap = async () => {
  // Fail fast, before Nest builds anything, with the names of the bad variables.
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.listen(env.PORT, "0.0.0.0");
  app.get(Logger).log(`API listening on port ${env.PORT}`, "Bootstrap");
};

bootstrap().catch((error: unknown) => {
  // Only the message: a driver error can echo connection details.
  console.error(
    "API failed to start:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exit(1);
});
