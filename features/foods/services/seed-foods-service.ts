import type { LibSQLDatabase } from "drizzle-orm/libsql";

import type * as schema from "@/db/schema";
import { foods } from "@/db/schema";
import { SEED_FOOD_TRANSLATIONS } from "@/features/foods/constants/food-translations";
import {
  SEED_FOODS,
  type SeedFood,
} from "@/features/foods/constants/seed-foods";
import { toNameKey } from "@/utils/name";

type Database = LibSQLDatabase<typeof schema>;

const toRow = (food: SeedFood) => {
  const nameKey = toNameKey(food.name);
  const translation = SEED_FOOD_TRANSLATIONS[nameKey];

  return {
    name: food.name,
    nameKey,
    nameEn: translation?.en ?? null,
    nameZh: translation?.zh ?? null,
    group: food.group,
    state: food.state,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    fiber: food.fiber,
    servingLabel: food.servingLabel ?? null,
    servingGrams: food.servingGrams ?? null,
    source: food.source,
  };
};

// Inserts the starter foods whose name is not in the table yet and returns
// how many it added. Archived rows count as present, so a food the PT removed
// is never brought back; existing rows are never updated.
export const insertMissingSeedFoods = async (
  database: Database,
  seedFoods: SeedFood[] = SEED_FOODS,
) => {
  const existing = await database
    .select({ nameKey: foods.nameKey })
    .from(foods);
  const taken = new Set(existing.map((row) => row.nameKey));
  const missing = seedFoods.map(toRow).filter((row) => !taken.has(row.nameKey));

  if (missing.length) {
    await database.insert(foods).values(missing);
  }
  return missing.length;
};
