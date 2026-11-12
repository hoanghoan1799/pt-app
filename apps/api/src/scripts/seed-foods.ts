// Adds the starter food library (about 60 common foods, USDA values per 100 g)
// to the database in DATABASE_URL. Safe to re-run: foods that are already
// there, archived ones included, are skipped and never changed.
//
//   pnpm --filter @pt/api foods:seed
import "reflect-metadata";

import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { buildDataSourceOptions } from "../database/data-source-options.js";
import { FoodsPolicy } from "../foods/foods.policy.js";
import { FoodsQueries } from "../foods/foods.queries.js";
import { FoodsService } from "../foods/foods.service.js";

const run = async () => {
  const { DATABASE_URL } = process.env;

  if (!DATABASE_URL) {
    console.error("Missing: DATABASE_URL must be set.");
    process.exit(1);
  }

  const dataSource = new DataSource(buildDataSourceOptions(DATABASE_URL));

  await dataSource.initialize();
  try {
    const service = new FoodsService(
      dataSource,
      new FoodsQueries(dataSource),
      new FoodsPolicy(),
      new Clock(),
    );
    const added = await service.insertMissingSeedFoods();

    console.log(
      added
        ? `Added ${added} foods to the food library.`
        : "The food library already has every starter food; nothing added.",
    );
  } finally {
    await dataSource.destroy();
  }
};

run().catch((error: unknown) => {
  console.error(
    "Seeding foods failed:",
    error instanceof Error ? error.name : "unknown error",
  );
  process.exit(1);
});
