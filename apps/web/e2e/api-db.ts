import pg from "pg";

import { hashPassword } from "@/services/password";
import { toEmailKey } from "@/utils/email";

import { E2E_DATABASE_URL, E2E_USER_PASSWORD, e2eEmail } from "./config";

// Direct access to the e2e PostgreSQL for the few things the API deliberately
// has no endpoint for: clearing the login limiter and putting a trainee's
// password back to the shared e2e one. Only the e2e database (its name must
// contain "e2e") is ever opened.
const assertE2eDatabase = () => {
  if (!new URL(E2E_DATABASE_URL).pathname.slice(1).includes("e2e")) {
    throw new Error("e2e: the API database name must contain 'e2e'");
  }
};

// `date` columns come back as "YYYY-MM-DD" strings, like in the API (a Date
// would shift the day with the machine's time zone).
const DATE_OID = 1082;
const pgTypes = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    oid === DATE_OID
      ? (value: string) => value
      : pg.types.getTypeParser(
          oid,
          format as "text",
        )) as typeof pg.types.getTypeParser,
};

export const withApiDb = async <T>(run: (client: pg.Client) => Promise<T>) => {
  assertE2eDatabase();
  const client = new pg.Client({
    connectionString: E2E_DATABASE_URL,
    types: pgTypes,
  });

  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

// Back to the seeded state: shared password, no password change, no failed
// logins counted, no signed-in devices.
export const restoreTraineeCredentials = async (name: string) => {
  const emailKey = toEmailKey(e2eEmail(name));
  const passwordHash = await hashPassword(E2E_USER_PASSWORD);

  await withApiDb(async (client) => {
    await client.query(
      "UPDATE users SET password_hash = $1, password_changed_at = NULL WHERE email_key = $2",
      [passwordHash, emailKey],
    );
    await client.query("DELETE FROM login_attempts WHERE key = $1", [
      `user:${emailKey}`,
    ]);
  });
};
