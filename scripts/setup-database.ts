// Prepares the database for the app:
//   1. creates/updates the tables from db/schema.ts (drizzle-kit push)
//   2. creates the first admin (super admin) from SUPER_ADMIN_USERNAME /
//      SUPER_ADMIN_PASSWORD (falls back to ADMIN_*) when the
//      database has no admin yet (an existing admin is never overwritten)
//   3. adds the starter food library when the foods table is empty
//   4. moves legacy hidden conversations to hidden trainees (KAN-163)
//   5. moves the shared chat nicknames to private contact aliases
//   6. gives pre-roles admins the super_admin role and the blue tick (P1)
//
// Runs automatically before `next build` on Vercel (see "build" in
// package.json); run `pnpm db:setup` to do the same by hand.
import { execSync } from "node:child_process";

import { count } from "drizzle-orm";

import {
  ADMIN_USERNAME_PATTERN,
  MIN_ADMIN_PASSWORD_LENGTH,
} from "@/constants/password";
import { db } from "@/db";
import { admins, foods } from "@/db/schema";
import { verifyExistingSuperAdmins } from "@/features/auth/services/verify-existing-admins";
import { moveHiddenConversationsToUsers } from "@/features/chat/services/hidden-users-migration";
import { moveChatNicknamesToAliases } from "@/features/contact-aliases/services/legacy-nicknames-migration";
import { insertMissingSeedFoods } from "@/features/foods/services/seed-foods-service";
import {
  describeDatabaseConfig,
  getSuperAdminCredentials,
} from "@/services/env";
import { hashPassword } from "@/services/password";
import { toUsernameKey } from "@/utils/username";

const IS_PREBUILD = process.argv.includes("--prebuild");

const pushSchema = () => {
  console.log(`▸ Đồng bộ bảng vào ${describeDatabaseConfig()}`);
  // Without --force: a change that would drop data stops the build instead.
  // drizzle-kit exits 0 even when it refuses a change (its data-loss prompt
  // needs a TTY), so read its output and fail the build ourselves.
  const output = execSync("pnpm exec drizzle-kit push 2>&1", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  console.log(output);
  if (/data-loss|Error:/i.test(output)) {
    throw new Error("drizzle-kit push did not apply the schema, see above");
  }
};

const createFirstAdmin = async () => {
  const [{ total }] = await db.select({ total: count() }).from(admins);

  if (total > 0) {
    console.log(`▸ Đã có ${total} admin, bỏ qua bước tạo admin`);
    return;
  }

  const { username, password } = getSuperAdminCredentials();

  if (
    !ADMIN_USERNAME_PATTERN.test(username) ||
    password.length < MIN_ADMIN_PASSWORD_LENGTH
  ) {
    console.warn(
      `⚠ Chưa có admin nào và SUPER_ADMIN_USERNAME/SUPER_ADMIN_PASSWORD chưa hợp lệ (username 3–32 ký tự a-z 0-9 . _ -, mật khẩu ≥ ${MIN_ADMIN_PASSWORD_LENGTH} ký tự) — chưa tạo admin`,
    );
    return;
  }

  await db.insert(admins).values({
    username,
    usernameKey: toUsernameKey(username),
    passwordHash: await hashPassword(password),
    role: "super_admin",
    verifiedAt: new Date(),
  });
  console.log(`✔ Đã tạo super admin "${username}"`);
};

// Only into an empty table: once the PT edits or removes foods, the build
// never touches them again.
const seedFoodLibrary = async () => {
  const [{ total }] = await db.select({ total: count() }).from(foods);

  if (total > 0) {
    console.log(
      `▸ Đã có ${total} món trong thư viện, bỏ qua bước thêm món mẫu`,
    );
    return;
  }

  const added = await insertMissingSeedFoods(db);

  console.log(`✔ Đã thêm ${added} món mẫu vào thư viện thực phẩm`);
};

const migrateHiddenConversations = async () => {
  const moved = await moveHiddenConversationsToUsers(db);

  if (moved > 0) {
    console.log(`✔ Đã chuyển ${moved} cuộc trò chuyện ẩn sang học viên ẩn`);
  }
};

const migrateChatNicknames = async () => {
  const moved = await moveChatNicknamesToAliases(db);

  if (moved > 0) {
    console.log(`✔ Đã chuyển ${moved} biệt danh chung sang biệt danh riêng`);
  }
};

const verifyLegacyAdmins = async () => {
  const changed = await verifyExistingSuperAdmins(db);

  if (changed > 0) {
    console.log(`✔ Đã gán super admin + tick xanh cho ${changed} admin cũ`);
  }
};

const setupDatabase = async () => {
  if (IS_PREBUILD && !process.env.VERCEL) {
    // Local `pnpm build` must not touch the database.
    return;
  }

  pushSchema();
  await createFirstAdmin();
  await seedFoodLibrary();
  await migrateHiddenConversations();
  await migrateChatNicknames();
  await verifyLegacyAdmins();
};

setupDatabase().catch((error) => {
  console.error("✖ Chuẩn bị database thất bại:", error);
  process.exit(1);
});
