import {
  type FoodFormValues,
  type FoodResponse,
  toNameKey,
} from "@pt/contracts";

import type { Food } from "../database/entities/food.entity.js";

// The columns a client may see: no timestamps, no archive flag.
export type FoodRow = Pick<
  Food,
  | "id"
  | "name"
  | "nameKey"
  | "nameEn"
  | "nameZh"
  | "group"
  | "state"
  | "kcal"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber"
  | "servingLabel"
  | "servingGrams"
  | "source"
>;

export const toFoodResponse = (food: FoodRow): FoodResponse => ({
  id: food.id,
  name: food.name,
  nameKey: food.nameKey,
  nameEn: food.nameEn,
  nameZh: food.nameZh,
  group: food.group,
  state: food.state,
  kcal: food.kcal,
  protein: food.protein,
  carbs: food.carbs,
  fat: food.fat,
  fiber: food.fiber,
  servingLabel: food.servingLabel,
  servingGrams: food.servingGrams,
  source: food.source,
});

// The checked form values as the columns to store: the "I checked" box is not
// stored, an empty serving label or translation becomes null, and the search
// key is added (readFoodForm in the web).
export const toFoodColumns = (values: FoodFormValues) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- not stored
  const { confirmed, ...rest } = values;

  return {
    ...rest,
    servingLabel: rest.servingLabel || null,
    nameEn: rest.nameEn || null,
    nameZh: rest.nameZh || null,
    nameKey: toNameKey(rest.name),
  };
};

export type FoodColumns = ReturnType<typeof toFoodColumns>;
