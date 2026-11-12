import dataSource from "./data-source.js";

// Applies pending migrations and exits. The compose file runs this before the
// API starts (`node dist/migrate.js`).
const run = async () => {
  await dataSource.initialize();

  try {
    const applied = await dataSource.runMigrations({ transaction: "each" });

    console.log(
      applied.length > 0
        ? `Applied migrations: ${applied.map((m) => m.name).join(", ")}`
        : "Database is up to date",
    );
  } finally {
    await dataSource.destroy();
  }
};

run().catch((error: unknown) => {
  // Only the message: a driver error can echo connection details.
  console.error(
    "Migration failed:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exit(1);
});
