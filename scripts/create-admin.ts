// Creates an admin account, or resets its password if the username exists.
//
//   pnpm admin:create <username> <password>
//
// Without arguments it reads SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD (or
// the older ADMIN_USERNAME / ADMIN_PASSWORD) from the environment (.env.local), which keeps the password out of shell history.
import {
  ADMIN_USERNAME_PATTERN,
  MIN_ADMIN_PASSWORD_LENGTH,
} from "@/constants/password";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { getSuperAdminCredentials } from "@/services/env";
import { hashPassword } from "@/services/password";
import { toUsernameKey } from "@/utils/username";

const fail = (message: string) => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

const createAdmin = async () => {
  const [argUsername, argPassword] = process.argv.slice(2);
  const fromEnv = getSuperAdminCredentials();
  const username = (argUsername ?? fromEnv.username).trim();
  const password = argPassword ?? fromEnv.password;

  if (!ADMIN_USERNAME_PATTERN.test(username)) {
    fail(
      "Username: 3–32 ký tự, chỉ gồm chữ, số, dấu chấm, gạch ngang, gạch dưới.",
    );
  }
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    fail(`Mật khẩu cần ít nhất ${MIN_ADMIN_PASSWORD_LENGTH} ký tự.`);
  }

  const passwordHash = await hashPassword(password);

  await db
    .insert(admins)
    .values({
      username,
      usernameKey: toUsernameKey(username),
      passwordHash,
      role: "super_admin",
      verifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: admins.usernameKey,
      set: { username, passwordHash },
    });

  console.log(`✔ Đã lưu tài khoản admin "${username}"`);
};

createAdmin();
