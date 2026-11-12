import "server-only";

import { and, asc, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { foods } from "@/db/schema";
import type { Food } from "@/features/foods/types/food";

const foodColumns = {
  id: foods.id,
  name: foods.name,
  nameKey: foods.nameKey,
  nameEn: foods.nameEn,
  nameZh: foods.nameZh,
  group: foods.group,
  state: foods.state,
  kcal: foods.kcal,
  protein: foods.protein,
  carbs: foods.carbs,
  fat: foods.fat,
  fiber: foods.fiber,
  servingLabel: foods.servingLabel,
  servingGrams: foods.servingGrams,
  source: foods.source,
};

// Active foods only: archived ones are hidden everywhere.
export const listFoods = async (): Promise<Food[]> =>
  db
    .select(foodColumns)
    .from(foods)
    .where(isNull(foods.archivedAt))
    .orderBy(asc(foods.nameKey));

export const getFood = async (id: number): Promise<Food | null> => {
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const [food] = await db
    .select(foodColumns)
    .from(foods)
    .where(and(eq(foods.id, id), isNull(foods.archivedAt)));

  return food ?? null;
};

// A name is unique among active foods; `exceptId` skips the food being edited.
export const findActiveFoodByNameKey = async (
  nameKey: string,
  exceptId?: number,
) => {
  const [found] = await db
    .select({ id: foods.id })
    .from(foods)
    .where(
      and(
        eq(foods.nameKey, nameKey),
        isNull(foods.archivedAt),
        exceptId === undefined ? undefined : ne(foods.id, exceptId),
      ),
    );

  return found ?? null;
};
