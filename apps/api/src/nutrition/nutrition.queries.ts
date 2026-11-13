import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { addDays, getWeekDates } from "@pt/contracts";
import { Between, DataSource, type EntityManager, MoreThan } from "typeorm";

import { BodyProfile } from "../database/entities/body-profile.entity.js";
import { FoodEntry } from "../database/entities/food-entry.entity.js";
import { NutritionTarget } from "../database/entities/nutrition-target.entity.js";
import { WeightLog } from "../database/entities/weight-log.entity.js";
import {
  type CountedItem,
  type CountedLog,
  type FrozenItem,
  listMealNutrition,
  resolveLogNutrition,
} from "./rules/meal-log.js";
import {
  buildNutritionDay,
  findTargetForDate,
} from "./rules/nutrition-math.js";
import type {
  BodyProfileValues,
  EntryRow,
  NutritionDay,
  TargetRow,
  WeightPoint,
} from "./rules/types.js";
import { getRecentWeekStarts, groupWeightsByWeek } from "./rules/weight.js";

export const toTargetRow = (row: NutritionTarget): TargetRow => ({
  effectiveFrom: row.effectiveFrom,
  carbs: row.carbs,
  protein: row.protein,
  fat: row.fat,
  note: row.note,
  source: row.source,
});

export const toEntryRow = (row: FoodEntry): EntryRow => ({
  id: row.id,
  date: row.date,
  meal: row.meal,
  description: row.description,
  carbs: row.carbs,
  protein: row.protein,
  fat: row.fat,
});

export const toBodyProfileValues = (row: BodyProfile): BodyProfileValues => ({
  sex: row.sex,
  birthYear: row.birthYear,
  heightCm: row.heightCm,
  weightKg: row.weightKg,
  activityLevel: row.activityLevel,
  goal: row.goal,
  kcalAdjustment: row.kcalAdjustment,
  proteinPerKg: row.proteinPerKg,
});

type Per100Row = {
  fProtein: number | null;
  fCarbs: number | null;
  fFat: number | null;
};

const foodOf = (row: Per100Row) =>
  row.fProtein === null || row.fCarbs === null || row.fFat === null
    ? null
    : { protein: row.fProtein, carbs: row.fCarbs, fat: row.fFat };

// Read models for the trainee's nutrition: targets, food entries, body profile,
// weigh-ins and the per-day totals that mix entries with the meal plan's logs.
@Injectable()
export class NutritionQueries {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Every target of the user, oldest first. Resolve a day with
  // findTargetForDate.
  async listTargets(
    userId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<TargetRow[]> {
    const rows = await manager.getRepository(NutritionTarget).find({
      where: { userId },
      order: { effectiveFrom: "ASC" },
    });

    return rows.map(toTargetRow);
  }

  async latestTarget(
    userId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<TargetRow | null> {
    const row = await manager.getRepository(NutritionTarget).findOne({
      where: { userId },
      order: { effectiveFrom: "DESC" },
    });

    return row ? toTargetRow(row) : null;
  }

  async targetForDate(userId: number, date: string) {
    return findTargetForDate(await this.listTargets(userId), date);
  }

  async findEntry(userId: number, id: number) {
    return this.dataSource
      .getRepository(FoodEntry)
      .findOne({ where: { id, userId } });
  }

  async bodyProfile(
    userId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<BodyProfileValues | null> {
    const row = await manager
      .getRepository(BodyProfile)
      .findOne({ where: { userId } });

    return row ? toBodyProfileValues(row) : null;
  }

  async todayWeight(userId: number, today: string) {
    const log = await this.dataSource
      .getRepository(WeightLog)
      .findOne({ where: { userId, date: today } });

    return log?.weightKg ?? null;
  }

  async weightLogsAfter(userId: number, from: string): Promise<WeightPoint[]> {
    const rows = await this.dataSource.getRepository(WeightLog).find({
      where: { userId, date: MoreThan(from) },
      order: { date: "DESC" },
    });

    return rows.map((row) => ({ date: row.date, weightKg: row.weightKg }));
  }

  // Weekly averages for the chart: the `weeks` weeks ending with `weekStart`.
  async weightTrend(userId: number, weekStart: string, weeks: number) {
    const weekStarts = getRecentWeekStarts(weekStart, weeks);
    const logs = await this.weightLogsAfter(userId, addDays(weekStarts[0], -1));

    return groupWeightsByWeek(logs, weekStarts);
  }

  // The seven days of a week: the target that applies, the free-text entries,
  // and what the meal plan counts as eaten (logs, and the planned items of a
  // meal marked "Đạt", frozen when they were marked).
  async nutritionWeek(
    userId: number,
    weekStart: string,
  ): Promise<NutritionDay[]> {
    const dates = getWeekDates(weekStart);
    const from = dates[0];
    const to = dates[dates.length - 1];
    const manager = this.dataSource.manager;
    const range = [userId, from, to];

    const [targets, entryRows, logRows, itemRows, markRows, frozenRows] =
      await Promise.all([
        this.listTargets(userId),
        manager.getRepository(FoodEntry).find({
          where: { userId, date: Between(from, to) },
          order: { id: "ASC" },
        }),
        manager.query<
          (Per100Row & {
            date: string;
            mealId: number;
            foodId: number | null;
            grams: number;
            kcal: number | null;
            protein: number | null;
            carbs: number | null;
            fat: number | null;
          })[]
        >(
          `SELECT d.date, l.meal_id AS "mealId", l.food_id AS "foodId", l.grams,
                  l.kcal, l.protein, l.carbs, l.fat,
                  f.protein AS "fProtein", f.carbs AS "fCarbs", f.fat AS "fFat"
             FROM meal_logs l
             JOIN meal_plan_meals m ON m.id = l.meal_id
             JOIN meal_plan_days d ON d.id = m.day_id
             LEFT JOIN foods f ON f.id = l.food_id
            WHERE l.user_id = $1 AND d.date BETWEEN $2 AND $3`,
          range,
        ),
        manager.query<
          (Per100Row & {
            date: string;
            mealId: number;
            foodId: number;
            grams: number;
          })[]
        >(
          `SELECT d.date, i.meal_id AS "mealId", i.food_id AS "foodId", i.grams,
                  f.protein AS "fProtein", f.carbs AS "fCarbs", f.fat AS "fFat"
             FROM meal_plan_items i
             JOIN meal_plan_meals m ON m.id = i.meal_id
             JOIN meal_plan_days d ON d.id = m.day_id
             LEFT JOIN foods f ON f.id = i.food_id
            WHERE d.user_id = $1 AND d.date BETWEEN $2 AND $3`,
          range,
        ),
        manager.query<{ id: number; mealId: number }[]>(
          `SELECT k.id, k.meal_id AS "mealId"
             FROM meal_marks k
             JOIN meal_plan_meals m ON m.id = k.meal_id
             JOIN meal_plan_days d ON d.id = m.day_id
            WHERE k.user_id = $1 AND k.achieved = true
              AND d.date BETWEEN $2 AND $3`,
          range,
        ),
        manager.query<
          {
            markId: number;
            foodId: number | null;
            kcal: number;
            protein: number;
            carbs: number;
            fat: number;
          }[]
        >(
          `SELECT x.mark_id AS "markId", x.food_id AS "foodId", x.kcal,
                  x.protein, x.carbs, x.fat
             FROM meal_mark_items x
             JOIN meal_plan_meals m ON m.id = x.meal_id
             JOIN meal_plan_days d ON d.id = m.day_id
            WHERE d.user_id = $1 AND d.date BETWEEN $2 AND $3`,
          range,
        ),
      ]);

    const achievedMealIds = new Set(markRows.map((row) => row.mealId));
    const markIdByMeal = new Map(markRows.map((row) => [row.mealId, row.id]));
    const mealIdsByDate = new Map<string, Set<number>>();

    for (const row of [...logRows, ...itemRows]) {
      mealIdsByDate.set(
        row.date,
        (mealIdsByDate.get(row.date) ?? new Set()).add(row.mealId),
      );
    }

    // What counts as eaten on one day, per meal.
    const getMealParts = (date: string) =>
      [...(mealIdsByDate.get(date) ?? [])].flatMap((mealId) => {
        const items: CountedItem[] = itemRows
          .filter((row) => row.mealId === mealId)
          .map((row) => ({
            foodId: row.foodId,
            grams: row.grams,
            food: foodOf(row),
          }));
        const logs: CountedLog[] = logRows
          .filter((row) => row.mealId === mealId)
          .map((row) => ({
            foodId: row.foodId,
            nutrition: resolveLogNutrition(
              row.grams,
              row.foodId !== null ? foodOf(row) : null,
              {
                kcal: row.kcal,
                protein: row.protein,
                carbs: row.carbs,
                fat: row.fat,
              },
            ),
          }));
        const frozen: FrozenItem[] = frozenRows
          .filter(
            (row) =>
              row.markId === markIdByMeal.get(mealId) && row.foodId !== null,
          )
          .map((row) => ({
            foodId: row.foodId as number,
            nutrition: {
              kcal: row.kcal,
              protein: row.protein,
              carbs: row.carbs,
              fat: row.fat,
            },
          }));

        return listMealNutrition(
          items,
          logs,
          achievedMealIds.has(mealId),
          frozen,
        );
      });

    return dates.map((date) =>
      buildNutritionDay(
        date,
        findTargetForDate(targets, date),
        entryRows.filter((row) => row.date === date).map(toEntryRow),
        // A part with no numbers (or a vanished food) counts as logged, 0 g.
        getMealParts(date).map(
          (part) => part ?? { kcal: 0, carbs: 0, protein: 0, fat: 0 },
        ),
      ),
    );
  }
}
