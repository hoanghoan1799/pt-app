import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type AddMealLogBody,
  getTodayDate,
  MEAL_LOG_LIMITS,
  type MealLogResponse,
  type MealMarkResponse,
  type SetMealMarkBody,
  type UpdateMealLogBody,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { MealLog } from "../database/entities/meal-log.entity.js";
import { MealMark } from "../database/entities/meal-mark.entity.js";
import { MealMarkItem } from "../database/entities/meal-mark-item.entity.js";
import { FoodFactsService } from "../foods/food-facts.service.js";
import { MealPlanQueries } from "./meal-plan.queries.js";
import { MealPlanStore } from "./meal-plan.store.js";
import { logErrors } from "./nutrition.errors.js";
import { nutritionOfFood } from "./rules/meal-log.js";

// The trainee's meal log (library foods and free foods) and the "Đạt" marks.
@Injectable()
export class MealLogsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly store: MealPlanStore,
    private readonly queries: MealPlanQueries,
    private readonly foods: FoodFactsService,
    private readonly clock: Clock,
  ) {}

  // The meal must belong to the trainee's own plan (a foreign id, a plan the
  // PT deleted or replaced, or nothing all answer MEAL_NOT_FOUND), and its day
  // must not be after today.
  private async loggableMeal(userId: number, mealId: number) {
    const found = await this.store.findMeal(this.dataSource.manager, mealId);

    if (!found || found.day.userId !== userId) {
      throw logErrors.mealNotFound();
    }
    if (found.day.date > getTodayDate(undefined, this.clock.now())) {
      throw logErrors.futureDay();
    }
    return found;
  }

  private async logView(mealId: number, logId: number): Promise<MealLogResponse> {
    const { logs } = await this.queries.mealLogData([mealId]);
    const log = logs.find((item) => item.id === logId);

    if (!log) {
      throw logErrors.logNotFound();
    }
    return log;
  }

  async addLog(
    userId: number,
    mealId: number,
    body: AddMealLogBody,
  ): Promise<MealLogResponse> {
    await this.loggableMeal(userId, mealId);

    // Library foods are looked up first (archived ones can't be logged anew).
    const food =
      body.kind === "library" ? await this.foods.findActive(body.foodId) : null;

    if (body.kind === "library" && !food) {
      throw logErrors.foodNotFound();
    }

    // Count and insert in one transaction, with the meal row locked, so adds
    // that arrive together can't go past the limit.
    const logId = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT id FROM meal_plan_meals WHERE id = $1 FOR UPDATE`,
        [mealId],
      );

      const existing = await manager.count(MealLog, { where: { mealId } });

      if (existing >= MEAL_LOG_LIMITS.MAX_LOGS_PER_MEAL) {
        throw logErrors.tooManyLogs();
      }

      if (body.kind === "library" && food) {
        // The numbers are stored with the log (KAN-93): editing the food
        // later does not change what was eaten.
        const inserted = await manager.insert(MealLog, {
          userId,
          mealId,
          foodId: food.id,
          grams: body.grams,
          ...nutritionOfFood(food, body.grams),
        });

        return (inserted.identifiers[0] as { id: number }).id;
      }

      const free = body as Extract<AddMealLogBody, { kind: "free" }>;
      const inserted = await manager.insert(MealLog, {
        userId,
        mealId,
        customName: free.customName,
        grams: free.grams,
        kcal: free.kcal,
        protein: free.protein,
        carbs: free.carbs,
        fat: free.fat,
      });

      return (inserted.identifiers[0] as { id: number }).id;
    });

    return this.logView(mealId, logId);
  }

  async updateLog(
    userId: number,
    logId: number,
    body: UpdateMealLogBody,
  ): Promise<MealLogResponse> {
    const log = await this.queries.findOwnedLog(userId, logId);

    if (!log) {
      throw logErrors.logNotFound();
    }

    // The meal may be gone (plan replaced): the log went with it, but a stale
    // row must not be editable either.
    await this.loggableMeal(userId, log.mealId);

    if (log.foodId !== null) {
      // Archived foods may still be edited; a deleted row may not.
      const food = await this.foods.findAny(log.foodId);

      if (!food) {
        throw logErrors.foodMissing();
      }
      if (body.grams <= 0) {
        throw logErrors.gramsRequired();
      }
      await this.dataSource.manager.update(
        MealLog,
        { id: log.id },
        // Recomputed from the library as it is now (KAN-93).
        {
          grams: body.grams,
          ...nutritionOfFood(food, body.grams),
          updatedAt: this.clock.now(),
        },
      );
    } else {
      if (!body.customName) {
        throw logErrors.nameRequired();
      }
      await this.dataSource.manager.update(
        MealLog,
        { id: log.id },
        {
          customName: body.customName,
          grams: body.grams,
          kcal: body.kcal,
          protein: body.protein,
          carbs: body.carbs,
          fat: body.fat,
          updatedAt: this.clock.now(),
        },
      );
    }
    return this.logView(log.mealId, log.id);
  }

  async removeLog(userId: number, logId: number) {
    const log = await this.queries.findOwnedLog(userId, logId);

    if (!log) {
      throw logErrors.logNotFound();
    }
    await this.dataSource.manager.delete(MealLog, { id: log.id, userId });
  }

  // S4: "Đạt" and/or a note about which food was short or over. Nothing set
  // (not achieved, empty note) removes the mark.
  async setMark(
    userId: number,
    mealId: number,
    body: SetMealMarkBody,
  ): Promise<MealMarkResponse | null> {
    await this.loggableMeal(userId, mealId);

    await this.dataSource.transaction(async (manager) => {
      const previous = await manager
        .getRepository(MealMark)
        .findOne({ where: { mealId } });

      if (!body.achieved && !body.note) {
        // The frozen items go with the mark (ON DELETE CASCADE).
        await manager.delete(MealMark, { mealId });
        return;
      }

      const upserted = await manager
        .createQueryBuilder()
        .insert()
        .into(MealMark)
        .values({
          mealId,
          userId,
          achieved: body.achieved,
          note: body.note,
        })
        .orUpdate(["achieved", "note", "updated_at"], ["meal_id"])
        .returning("id")
        .execute();
      const markId = (upserted.raw as { id: number }[])[0].id;

      // KAN-93: "Đạt" freezes the planned items as they are now. Turning it on
      // takes a fresh snapshot; a note-only save keeps it; turning it off
      // drops it.
      if (body.achieved && previous?.achieved) {
        return;
      }
      await manager.delete(MealMarkItem, { markId });
      if (!body.achieved) {
        return;
      }

      const items = await manager.query<
        {
          foodId: number;
          grams: number;
          protein: number | null;
          carbs: number | null;
          fat: number | null;
        }[]
      >(
        `SELECT i.food_id AS "foodId", i.grams, f.protein, f.carbs, f.fat
           FROM meal_plan_items i
           LEFT JOIN foods f ON f.id = i.food_id
          WHERE i.meal_id = $1
          ORDER BY i.id`,
        [mealId],
      );

      if (items.length > 0) {
        await manager.insert(
          MealMarkItem,
          items.map((item) => ({
            markId,
            mealId,
            foodId: item.foodId,
            grams: item.grams,
            // A food row that is gone counts 0 g, as the live plan does.
            ...(item.protein !== null &&
            item.carbs !== null &&
            item.fat !== null
              ? nutritionOfFood(
                  { protein: item.protein, carbs: item.carbs, fat: item.fat },
                  item.grams,
                )
              : { protein: 0, carbs: 0, fat: 0, kcal: 0 }),
          })),
        );
      }
    });

    const { marks } = await this.queries.mealLogData([mealId]);

    return marks[0] ?? null;
  }
}
