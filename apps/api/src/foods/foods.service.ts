import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { type FoodFormValues, type FoodResponse, toNameKey } from "@pt/contracts";
import { DataSource, QueryFailedError } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import { Clock } from "../common/clock.js";
import { Food } from "../database/entities/food.entity.js";
import { FoodNameTakenError, FoodNotFoundError } from "./foods.errors.js";
import { type FoodColumns, toFoodColumns, toFoodResponse } from "./foods.mapper.js";
import { FoodsPolicy } from "./foods.policy.js";
import { FoodsQueries } from "./foods.queries.js";
import { SEED_FOOD_TRANSLATIONS } from "./seed/food-translations.js";
import { SEED_FOODS, type SeedFood } from "./seed/seed-foods.js";

const UNIQUE_VIOLATION = "23505";
const ACTIVE_NAME_INDEX = "foods_active_name_key";

// Two saves with the same name raced past the check: the unique index of
// active names refuses the second one.
const isNameTaken = (error: unknown) =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string; constraint?: string }).code ===
    UNIQUE_VIOLATION &&
  (error.driverError as { constraint?: string }).constraint ===
    ACTIVE_NAME_INDEX;

export const toSeedColumns = (food: SeedFood) => {
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

// Use cases of the food library: super admin writes (create, update, archive)
// and the starter-library seed. Reads are in FoodsQueries.
@Injectable()
export class FoodsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queries: FoodsQueries,
    private readonly policy: FoodsPolicy,
    private readonly clock: Clock,
  ) {}

  async create(actor: AuthActor, values: FoodFormValues): Promise<FoodResponse> {
    this.policy.assertCanManage(actor);

    const columns = toFoodColumns(values);

    if (await this.queries.findActiveByNameKey(columns.nameKey)) {
      throw new FoodNameTakenError();
    }

    try {
      const saved = await this.dataSource.getRepository(Food).save(columns);
      const created = await this.queries.findActive(saved.id);

      if (!created) {
        throw new FoodNotFoundError();
      }
      return toFoodResponse(created);
    } catch (error) {
      throw isNameTaken(error) ? new FoodNameTakenError() : error;
    }
  }

  async update(
    actor: AuthActor,
    id: number,
    values: FoodFormValues,
  ): Promise<FoodResponse> {
    this.policy.assertCanManage(actor);

    const columns = toFoodColumns(values);

    if (await this.queries.findActiveByNameKey(columns.nameKey, id)) {
      throw new FoodNameTakenError();
    }

    const updated = await this.updateActive(id, columns);
    const food = updated ? await this.queries.findActive(id) : null;

    // Archived or removed since the page was opened.
    if (!food) {
      throw new FoodNotFoundError();
    }
    return toFoodResponse(food);
  }

  // "Xóa" archives: the row stays so later meal plans keep their numbers.
  async archive(actor: AuthActor, id: number): Promise<void> {
    this.policy.assertCanManage(actor);

    const now = this.clock.now();
    const result = await this.dataSource
      .createQueryBuilder()
      .update(Food)
      .set({ archivedAt: now, updatedAt: now })
      .where("id = :id AND archived_at IS NULL", { id })
      .returning("id")
      .execute();

    if (!result.raw.length) {
      throw new FoodNotFoundError();
    }
  }

  // Inserts the starter foods whose name is not in the table yet and returns
  // how many it added. Archived rows count as present, so a food the PT
  // removed never comes back; existing rows are never updated.
  insertMissingSeedFoods(seedFoods: SeedFood[] = SEED_FOODS): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const existing: { nameKey: string }[] = await manager
        .getRepository(Food)
        .createQueryBuilder("f")
        .select("f.name_key", "nameKey")
        .getRawMany();
      const taken = new Set(existing.map((row) => row.nameKey));
      const missing = seedFoods
        .map(toSeedColumns)
        .filter((row) => !taken.has(row.nameKey));

      if (missing.length) {
        await manager.insert(Food, missing);
      }
      return missing.length;
    });
  }

  private async updateActive(id: number, columns: FoodColumns) {
    try {
      const result = await this.dataSource
        .createQueryBuilder()
        .update(Food)
        .set({ ...columns, updatedAt: this.clock.now() })
        .where("id = :id AND archived_at IS NULL", { id })
        .returning("id")
        .execute();

      return result.raw.length > 0;
    } catch (error) {
      throw isNameTaken(error) ? new FoodNameTakenError() : error;
    }
  }
}
