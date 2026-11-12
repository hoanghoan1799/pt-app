import { ThrottlerModule } from "@nestjs/throttler";

import { APP_ENV } from "../config/app-config.module.js";
import type { Env } from "../config/env.schema.js";

// Coarse per-IP limit on the credential routes (login, passcode verify/reset,
// reveal), applied with `@UseGuards(ThrottlerGuard)`. The per-account lockout in
// `login_attempts` stays the source of truth for the 5 failures / 15 minutes rule.
// One shared dynamic module, so every importer uses the same counters.
export const LOGIN_THROTTLE_TTL_MS = 60_000;

export const LoginThrottlerModule = ThrottlerModule.forRootAsync({
  inject: [APP_ENV],
  useFactory: (env: Env) => ({
    throttlers: [
      {
        name: "default",
        ttl: LOGIN_THROTTLE_TTL_MS,
        limit: env.LOGIN_THROTTLE_LIMIT,
      },
    ],
    errorMessage: "Quá nhiều yêu cầu. Thử lại sau ít phút.",
  }),
});
