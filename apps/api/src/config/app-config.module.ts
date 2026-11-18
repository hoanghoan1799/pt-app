import { Global, Module } from "@nestjs/common";

import { setAvatarUrlSecret } from "../files/image-rules.js";
import { type Env, loadEnv } from "./env.schema.js";

// Injection token for the validated environment.
export const APP_ENV = Symbol("APP_ENV");

// Validates process.env once at boot (the app fails fast) and shares the typed
// result; nothing else reads process.env.
@Global()
@Module({
  providers: [
    {
      provide: APP_ENV,
      useFactory: (): Env => {
        const env = loadEnv();

        // Never logged. Unset (development, test) keeps the local default.
        if (env.AVATAR_URL_SECRET) {
          setAvatarUrlSecret(env.AVATAR_URL_SECRET);
        }
        return env;
      },
    },
  ],
  exports: [APP_ENV],
})
export class AppConfigModule {}
