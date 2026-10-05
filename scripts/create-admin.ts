// Creates an admin account, or resets its password if the username exists.
//
//   npm run admin:create -- <username> <password>
//
// Without arguments it reads ADMIN_USERNAME and ADMIN_PASSWORD from the
// environment (.env.local), which keeps the password out of shell history.
import {
  ADMIN_USERNAME_PATTERN,
  MIN_ADMIN_PASSWORD_LENGTH,
} from "@/constants/password";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { hashPassword } from "@/services/password";
import { toUsernameKey } from "@/utils/username";

const fail = (message: string) => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

const createAdmin = async () => {
  const [argUsername, argPassword] = process.argv.slice(2);
  const username = (argUsername ?? process.env.ADMIN_USERNAME ?? "").trim();
  const password = argPassword ?? process.env.ADMIN_PASSWORD ?? "";

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
    .values({ username, usernameKey: toUsernameKey(username), passwordHash })
    .onConflictDoUpdate({
      target: admins.usernameKey,
      set: { username, passwordHash },
    });

  console.log(`✔ Đã lưu tài khoản admin "${username}"`);
};

createAdmin();
