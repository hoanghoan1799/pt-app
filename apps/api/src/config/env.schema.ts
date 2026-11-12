import { z } from "zod";

// An empty variable (`PORT=` in a compose file or .env) counts as unset.
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const NODE_ENVS = ["development", "test", "production"] as const;
export const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

export const envSchema = z.object({
  // Defaults to production so a deploy that forgets NODE_ENV fails safe: no
  // error details in responses, no Swagger, warn-level logs. Local dev sets
  // NODE_ENV=development (apps/api/.env.example).
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(NODE_ENVS).default("production"),
  ),
  PORT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(65535).default(4000),
  ),
  // The browser origin of the web app (CORS and Socket.IO allow-list later).
  WEB_ORIGIN: z.preprocess(
    emptyToUndefined,
    z.url().default("http://localhost:3000"),
  ),
  // The only required variable: the API cannot start without its database.
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  // Requests per minute and IP on the credential routes (login, passcode).
  // The per-account lockout in the database is separate and always on.
  LOGIN_THROTTLE_LIMIT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(100000).default(20),
  ),
  // GIPHY sticker search. Optional: without a key the GIPHY tab switches off
  // (the endpoint answers `{ enabled: false }`).
  GIPHY_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  // Web push (VAPID). All three are optional: without them push is switched off
  // and nothing is ever sent. Generate keys with `npx web-push generate-vapid-keys`.
  VAPID_PUBLIC_KEY: z.preprocess(
    emptyToUndefined,
    z.string().min(1).optional(),
  ),
  VAPID_PRIVATE_KEY: z.preprocess(
    emptyToUndefined,
    z.string().min(1).optional(),
  ),
  // A mailto: or https: contact for the push services.
  VAPID_SUBJECT: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  // Seconds between re-checks of every open socket's session (sign-out, expiry,
  // lock). Unset means 300.
  REALTIME_RECHECK_SECONDS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(3600).default(300),
  ),
  // Unset means "info" in development and "warn" in production.
  LOG_LEVEL: z.preprocess(emptyToUndefined, z.enum(LOG_LEVELS).optional()),
});

export type Env = z.infer<typeof envSchema>;

const variableName = (path: readonly PropertyKey[]) =>
  path.map(String).join(".");

// Throws one readable error that names every missing or invalid variable. It
// never includes a value: DATABASE_URL carries a password.
export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const result = envSchema.safeParse(source);

  if (result.success) {
    return result.data;
  }

  const missing: string[] = [];
  const invalid: string[] = [];

  for (const issue of result.error.issues) {
    const name = variableName(issue.path);
    const unset = source[name] === undefined || source[name] === "";

    if (unset) {
      missing.push(name);
    } else {
      invalid.push(name);
    }
  }

  const parts = [
    missing.length > 0 && `missing: ${missing.join(", ")}`,
    invalid.length > 0 &&
      `invalid (values are not printed): ${invalid.join(", ")}`,
  ].filter(Boolean);

  throw new Error(`Invalid environment, ${parts.join("; ")}`);
};
