import { z } from "zod";

// An empty variable (`PORT=` in a compose file or .env) counts as unset.
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const envSchema = z.object({
  PORT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(65535).default(4000),
  ),
  // The browser origin of the web app (CORS and Socket.IO allow-list later).
  WEB_ORIGIN: z.preprocess(
    emptyToUndefined,
    z.url().default("http://localhost:3000"),
  ),
  // Optional until the database module lands.
  DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^postgres(ql)?:\/\//)
      .optional(),
  ),
});

export type Env = z.infer<typeof envSchema>;

// Throws one readable error listing every invalid variable.
export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment: ${details}`);
  }
  return result.data;
};
