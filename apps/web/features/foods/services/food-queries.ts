import "server-only";

import { FOOD_LIST_LIMIT } from "@pt/contracts";

import type { Food } from "@/features/foods/types/food";
import { callApi, tryApi } from "@/services/api/call";
import type { ApiActor } from "@/services/api/client";

type FoodReader = Exclude<ApiActor, "none">;

// The library pages with a cursor (at most FOOD_LIST_LIMIT.MAX per page). The
// screens filter in the browser, so the whole active library is read page by
// page; a runaway cursor is cut off at MAX_PAGES.
const MAX_PAGES = 50;

// Active foods only: archived ones are hidden everywhere. Sorted by name key.
export const listFoods = async (actor: FoodReader): Promise<Food[]> => {
  const foods: Food[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await callApi(actor, (api) =>
      api.GET("/v1/foods", {
        params: { query: { limit: FOOD_LIST_LIMIT.MAX, cursor } },
      }),
    );

    foods.push(...result.items);
    if (!result.nextCursor) {
      break;
    }
    cursor = result.nextCursor;
  }
  return foods;
};

// Null for a missing, archived or malformed id.
export const getFood = async (
  actor: FoodReader,
  id: number,
): Promise<Food | null> => {
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const outcome = await tryApi(actor, (api) =>
    api.GET("/v1/foods/{id}", { params: { path: { id: String(id) } } }),
  );

  if (outcome.ok) {
    return outcome.data;
  }
  if (outcome.error.status === 404) {
    return null;
  }
  throw outcome.error;
};
