// Creates the first super admin from the environment:
//
//   SUPER_ADMIN_USERNAME=... SUPER_ADMIN_PASSWORD=... pnpm --filter @pt/api admin:create
//
// Reads DATABASE_URL, SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD from the
// environment (apps/api/.env), which keeps the password out of shell history.
// An existing admin is never overwritten. The password is never printed.
import "reflect-metadata";

import { DataSource } from "typeorm";

import { buildDataSourceOptions } from "../database/data-source-options.js";
import {
  createSuperAdmin,
  InvalidSuperAdminInput,
} from "./create-super-admin.js";

const run = async () => {
  const { DATABASE_URL, SUPER_ADMIN_USERNAME, SUPER_ADMIN_PASSWORD } =
    process.env;

  if (!DATABASE_URL || !SUPER_ADMIN_USERNAME || !SUPER_ADMIN_PASSWORD) {
    console.error(
      "Missing: DATABASE_URL, SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD must all be set.",
    );
    process.exit(1);
  }

  const dataSource = new DataSource(buildDataSourceOptions(DATABASE_URL));

  await dataSource.initialize();
  try {
    const result = await createSuperAdmin(dataSource, {
      username: SUPER_ADMIN_USERNAME,
      password: SUPER_ADMIN_PASSWORD,
    });

    console.log(
      result === "created"
        ? `Created super admin "${SUPER_ADMIN_USERNAME.trim()}".`
        : `Admin "${SUPER_ADMIN_USERNAME.trim()}" already exists; nothing changed.`,
    );
  } finally {
    await dataSource.destroy();
  }
};

run().catch((error: unknown) => {
  // Only the message of our own validation errors; a driver error can echo
  // connection details.
  console.error(
    error instanceof InvalidSuperAdminInput
      ? error.message
      : "Could not create the super admin (database error).",
  );
  process.exit(1);
});
