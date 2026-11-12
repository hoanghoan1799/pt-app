import type { INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { AppModule } from "../../src/app.module.js";
import { configureApp } from "../../src/app.setup.js";

// Boots the real AppModule against `databaseUrl`. The environment is read from
// process.env exactly like production, so the test sets it first. Vitest runs
// each test file in its own worker, so this does not leak between files.
export const createTestApp = async (options: {
  databaseUrl: string;
  nodeEnv: "development" | "test" | "production";
  controllers?: Type[];
  overrideProviders?: { token: unknown; value: unknown }[];
  // Extra environment variables, e.g. LOGIN_THROTTLE_LIMIT.
  env?: Record<string, string>;
}): Promise<INestApplication> => {
  process.env.DATABASE_URL = options.databaseUrl;
  process.env.NODE_ENV = options.nodeEnv;
  process.env.LOG_LEVEL = "silent";
  process.env.LOGIN_THROTTLE_LIMIT = "100000";
  Object.assign(process.env, options.env);

  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  });

  for (const { token, value } of options.overrideProviders ?? []) {
    builder = builder.overrideProvider(token).useValue(value);
  }

  const app = (await builder.compile()).createNestApplication();

  configureApp(app);
  await app.init();
  return app;
};
