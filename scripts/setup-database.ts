// Prepares the database for the app:
//   1. creates/updates the tables from db/schema.ts (drizzle-kit push)
//   2. creates the first admin from ADMIN_USERNAME / ADMIN_PASSWORD when the
//      database has no admin yet (an existing admin is never overwritten)
//
// Runs automatically before `next build` on Vercel (see "prebuild" in
// package.json); run `npm run db:setup` to do the same by hand.
import { execSync } from "node:child_process";

import { count } from "drizzle-orm";

import {
  ADMIN_USERNAME_PATTERN,
  MIN_ADMIN_PASSWORD_LENGTH,
} from "@/constants/password";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { describeDatabaseConfig } from "@/services/env";
import { hashPassword } from "@/services/password";
import { toUsernameKey } from "@/utils/username";

const IS_PREBUILD = process.argv.includes("--prebuild");

const pushSchema = () => {
  console.log(`▸ Đồng bộ bảng vào ${describeDatabaseConfig()}`);
  // Without --force: a change that would drop data stops the build instead.
  execSync("npx drizzle-kit push", { stdio: "inherit" });
};

const createFirstAdmin = async () => {
  const [{ total }] = await db.select({ total: count() }).from(admins);

  if (total > 0) {
    console.log(`▸ Đã có ${total} admin, bỏ qua bước tạo admin`);
    return;
  }

  const username = process.env.ADMIN_USERNAME?.trim() ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (
    !ADMIN_USERNAME_PATTERN.test(username) ||
    password.length < MIN_ADMIN_PASSWORD_LENGTH
  ) {
    console.warn(
      `⚠ Chưa có admin nào và ADMIN_USERNAME/ADMIN_PASSWORD chưa hợp lệ (username 3–32 ký tự a-z 0-9 . _ -, mật khẩu ≥ ${MIN_ADMIN_PASSWORD_LENGTH} ký tự) — chưa tạo admin`,
    );
    return;
  }

  await db.insert(admins).values({
    username,
    usernameKey: toUsernameKey(username),
    passwordHash: await hashPassword(password),
  });
  console.log(`✔ Đã tạo admin "${username}"`);
};

const setupDatabase = async () => {
  if (IS_PREBUILD && !process.env.VERCEL) {
    // Local `npm run build` must not touch the database.
    return;
  }

  pushSchema();
  await createFirstAdmin();
};

setupDatabase().catch((error) => {
  console.error("✖ Chuẩn bị database thất bại:", error);
  process.exit(1);
});
