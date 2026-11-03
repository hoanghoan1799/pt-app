import "server-only";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  MEMBER_MESSAGES,
  MEMBER_NAME_MAX_LENGTH,
} from "@/features/members/constants/messages";
import { generatePassword, hashPassword } from "@/services/password";
import { findUserByEmail, findUserByName } from "@/services/users";
import { emailSchema, toEmailKey } from "@/utils/email";
import { normalizeName, toNameKey } from "@/utils/name";

export type CreateMemberWithLoginResult =
  | { status: "success"; userId: number; name: string; password: string }
  | { status: "error"; field: "name" | "email"; message: string };

// Used by the admin create-member action (PR 2, KAN-84): validates name and
// email, refuses duplicates, inserts the trainee with a random password and
// returns that password once. Callers must run requireAdmin() first; the
// plain password is never stored or logged.
export const createMemberWithLogin = async (
  rawName: string,
  rawEmail: string,
): Promise<CreateMemberWithLoginResult> => {
  const name = normalizeName(rawName);

  if (!name) {
    return {
      status: "error",
      field: "name",
      message: MEMBER_MESSAGES.NAME_REQUIRED,
    };
  }

  if (name.length > MEMBER_NAME_MAX_LENGTH) {
    return {
      status: "error",
      field: "name",
      message: MEMBER_MESSAGES.NAME_TOO_LONG,
    };
  }

  const parsedEmail = emailSchema.safeParse(rawEmail);

  if (!parsedEmail.success) {
    return {
      status: "error",
      field: "email",
      message: parsedEmail.error.issues[0].message,
    };
  }

  const email = parsedEmail.data;

  if (await findUserByName(name)) {
    return {
      status: "error",
      field: "name",
      message: MEMBER_MESSAGES.NAME_TAKEN,
    };
  }

  if (await findUserByEmail(email)) {
    return {
      status: "error",
      field: "email",
      message: MEMBER_MESSAGES.EMAIL_TAKEN,
    };
  }

  const password = generatePassword();
  const [created] = await db
    .insert(users)
    .values({
      name,
      nameKey: toNameKey(name),
      email,
      emailKey: toEmailKey(email),
      passwordHash: await hashPassword(password),
      // Whole seconds, so it compares cleanly with a session's `iat`.
      passwordChangedAt: new Date(Math.floor(Date.now() / 1000) * 1000),
    })
    .returning({ id: users.id });

  return { status: "success", userId: created.id, name, password };
};
