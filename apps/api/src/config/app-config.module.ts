import { Global, Module } from "@nestjs/common";

import { type Env, loadEnv } from "./env.schema.js";

// Injection token for the validated environment.
export const APP_ENV = Symbol("APP_ENV");

// Validates process.env once at boot (the app fails fast) and shares the typed
// result; nothing else reads process.env.
@Global()
@Module({
  providers: [{ provide: APP_ENV, useFactory: (): Env => loadEnv() }],
  exports: [APP_ENV],
})
export class AppConfigModule {}
