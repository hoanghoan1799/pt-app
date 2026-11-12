import {
  ADMIN_USERNAME_PATTERN,
  MIN_ADMIN_PASSWORD_LENGTH,
} from "@pt/contracts";
import type { DataSource } from "typeorm";

import { toUsernameKey } from "../auth/keys.js";
import { hashPassword } from "../auth/password-hash.js";

export type CreateSuperAdminResult = "created" | "exists";

export class InvalidSuperAdminInput extends Error {}

// Creates the first super admin. Never overwrites: an existing username (any
// case) is left exactly as it is, password included. Unlike the web script it
// has no "reset password" mode.
export const createSuperAdmin = async (
  dataSource: DataSource,
  input: { username: string; password: string },
): Promise<CreateSuperAdminResult> => {
  const username = input.username.trim();

  if (!ADMIN_USERNAME_PATTERN.test(username)) {
    throw new InvalidSuperAdminInput(
      "SUPER_ADMIN_USERNAME must be 3-32 characters: letters, digits, dot, dash, underscore.",
    );
  }
  if (input.password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new InvalidSuperAdminInput(
      `SUPER_ADMIN_PASSWORD needs at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const rows: unknown[] = await dataSource.query(
    `INSERT INTO admins (username, username_key, password_hash, role, verified_at)
     VALUES ($1, $2, $3, 'super_admin', now())
     ON CONFLICT (username_key) DO NOTHING
     RETURNING id`,
    [username, toUsernameKey(username), await hashPassword(input.password)],
  );

  return rows.length > 0 ? "created" : "exists";
};
