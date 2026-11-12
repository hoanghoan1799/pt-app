import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";
import { loadEnv } from "./config/env.schema.js";

const bootstrap = async () => {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  await app.listen(env.PORT, "0.0.0.0");
  new Logger("Bootstrap").log(`API listening on port ${env.PORT}`);
};

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
