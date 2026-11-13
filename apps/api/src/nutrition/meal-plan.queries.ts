import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  addDays,
  getWeekDates,
  MEAL_LOG_MESSAGES,
  type MealLogResponse,
  type MealMarkResponse,
  type PlanDayResponse,
} from "@pt/contracts";
import { DataSource, type EntityManager, In } from "typeorm";

import { MealPlanItem } from "../database/entities/meal-plan-item.entity.js";
import { MealPlanMeal } from "../database/entities/meal-plan-meal.entity.js";
import { FoodFactsService } from "../foods/food-facts.service.js";
import { toPlanFoodResponse } from "./mappers.js";
import { type DayRow, MealPlanStore } from "./meal-plan.store.js";
import { NutritionQueries } from "./nutrition.queries.js";
import {
  buildWeekCompletion,
  type DayCompletion,
} from "./rules/day-completion.js";
import { macrosOf, resolveLogNutrition, sumMacros } from "./rules/meal-log.js";
import {
  calculateCalories,
  findTargetForDate,
} from "./rules/nutrition-math.js";
import {
  getPlanKcalNotices,
  NOTICE_HORIZON_DAYS,
  type PlanKcalNotice,
} from "./rules/plan-notice.js";

const NO_NUMBERS = { kcal: null, protein: null, carbs: null, fat: null };

type LogRow = {
  id: number;
  mealId: number;
  foodId: number | null;
  customName: string | null;
  grams: number;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fName: string | null;
  fNameEn: string | null;
  fNameZh: string | null;
  fProtein: number | null;
  fCarbs: number | null;
  fFat: number | null;
  fArchivedAt: Date | null;
};

// Read models for meal plans, meal logs, marks and the PT's copy sheet.
@Injectable()
export class MealPlanQueries {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly store: MealPlanStore,
    private readonly foods: FoodFactsService,
    private readonly nutrition: NutritionQueries,
  ) {}

  // The plan of the given days, meals in order, each item with its food
  // (archived foods are NOT filtered out: a plan keeps what it was built with).
  async loadPlanDays(
    days: DayRow[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<PlanDayResponse[]> {
    if (days.length === 0) {
      return [];
    }

    const mealRows = await manager.getRepository(MealPlanMeal).find({
      where: { dayId: In(days.map((day) => day.id)) },
      order: { position: "ASC", id: "ASC" },
    });
    const itemRows = mealRows.length
      ? await manager.getRepository(MealPlanItem).find({
          where: { mealId: In(mealRows.map((meal) => meal.id)) },
          order: { id: "ASC" },
        })
      : [];
    const foods = await this.foods.findManyAny(
      [...new Set(itemRows.map((item) => item.foodId))],
      manager,
    );

    return days.map((day) => ({
      id: day.id,
      date: day.date,
      meals: mealRows
        .filter((meal) => meal.dayId === day.id)
        .map((meal) => ({
          id: meal.id,
          position: meal.position,
          name: meal.name,
          sharePercent: meal.sharePercent,
          items: itemRows
            .filter((item) => item.mealId === meal.id)
            .flatMap((item) => {
              const food = foods.get(item.foodId);

              return food
                ? [
                    {
                      id: item.id,
                      foodId: item.foodId,
                      grams: item.grams,
                      food: toPlanFoodResponse(food),
                    },
                  ]
                : [];
            }),
        })),
    }));
  }

  async planDay(dayId: number, manager?: EntityManager) {
    const day = await this.store.findDay(
      manager ?? this.dataSource.manager,
      dayId,
    );

    return day ? (await this.loadPlanDays([day], manager))[0] : null;
  }

  async planWeek(userId: number, weekStart: string) {
    const dates = getWeekDates(weekStart);
    const days = await this.store.listDaysInRange(
      this.dataSource.manager,
      userId,
      dates[0],
      dates[dates.length - 1],
    );

    return this.loadPlanDays(days);
  }

  // Logs and marks of the given plan meals. Archived foods still resolve: a
  // log keeps its numbers.
  async mealLogData(
    mealIds: number[],
    manager: EntityManager = this.dataSource.manager,
  ) {
    if (mealIds.length === 0) {
      return { logs: [] as MealLogResponse[], marks: [] as MealMarkResponse[] };
    }

    const [logRows, markRows, frozenRows] = await Promise.all([
      manager.query<LogRow[]>(
        `SELECT l.id, l.meal_id AS "mealId", l.food_id AS "foodId",
                l.custom_name AS "customName", l.grams, l.kcal, l.protein,
                l.carbs, l.fat,
                f.name AS "fName", f.name_en AS "fNameEn", f.name_zh AS "fNameZh",
                f.protein AS "fProtein", f.carbs AS "fCarbs", f.fat AS "fFat",
                f.archived_at AS "fArchivedAt"
           FROM meal_logs l
           LEFT JOIN foods f ON f.id = l.food_id
          WHERE l.meal_id = ANY($1)
          ORDER BY l.id`,
        [mealIds],
      ),
      manager.query<
        { id: number; mealId: number; achieved: boolean; note: string }[]
      >(
        `SELECT id, meal_id AS "mealId", achieved, note
           FROM meal_marks WHERE meal_id = ANY($1) ORDER BY id`,
        [mealIds],
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
        `SELECT mark_id AS "markId", food_id AS "foodId", kcal, protein, carbs, fat
           FROM meal_mark_items WHERE meal_id = ANY($1) ORDER BY id`,
        [mealIds],
      ),
    ]);

    const logs: MealLogResponse[] = logRows.map((log) => {
      const typed = {
        kcal: log.kcal,
        protein: log.protein,
        carbs: log.carbs,
        fat: log.fat,
      };
      const food =
        log.fProtein === null || log.fCarbs === null || log.fFat === null
          ? null
          : { protein: log.fProtein, carbs: log.fCarbs, fat: log.fFat };
      const isMissingFood = log.foodId !== null && log.fName === null;

      return {
        id: log.id,
        mealId: log.mealId,
        foodId: log.foodId,
        name: isMissingFood
          ? MEAL_LOG_MESSAGES.MISSING_FOOD_NAME
          : (log.fName ?? log.customName ?? ""),
        nameEn: log.fNameEn,
        nameZh: log.fNameZh,
        isFree: log.foodId === null,
        isArchived: log.fArchivedAt !== null,
        isMissingFood,
        grams: log.grams,
        typed: log.foodId !== null ? NO_NUMBERS : typed,
        // A missing food has nothing to scale: numbers stored on the row are
        // kept, otherwise none (not zeros).
        nutrition: resolveLogNutrition(log.grams, food, typed),
      };
    });

    return {
      logs,
      marks: markRows.map((row) => ({
        mealId: row.mealId,
        achieved: row.achieved,
        note: row.note,
        frozen: frozenRows
          .filter((item) => item.markId === row.id && item.foodId !== null)
          .map((item) => ({
            foodId: item.foodId as number,
            nutrition: {
              kcal: item.kcal,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat,
            },
          })),
      })),
    };
  }

  async findOwnedLog(userId: number, logId: number) {
    const rows = await this.dataSource.manager.query<
      { id: number; mealId: number; foodId: number | null }[]
    >(
      `SELECT id, meal_id AS "mealId", food_id AS "foodId"
         FROM meal_logs WHERE id = $1 AND user_id = $2`,
      [logId, userId],
    );

    return rows[0] ?? null;
  }

  // Plan dates from `from` to `to` where the trainee logged or marked
  // something: copying over or deleting such a day deletes that too.
  async datesWithLogs(userId: number, from: string, to: string) {
    const rows = await this.dataSource.manager.query<{ date: string }[]>(
      `SELECT d.date FROM meal_logs l
         JOIN meal_plan_meals m ON m.id = l.meal_id
         JOIN meal_plan_days d ON d.id = m.day_id
        WHERE d.user_id = $1 AND d.date BETWEEN $2 AND $3
       UNION
       SELECT d.date FROM meal_marks k
         JOIN meal_plan_meals m ON m.id = k.meal_id
         JOIN meal_plan_days d ON d.id = m.day_id
        WHERE d.user_id = $1 AND d.date BETWEEN $2 AND $3
       ORDER BY date`,
      [userId, from, to],
    );

    return rows.map((row) => row.date);
  }

  // Completion of each date of the week: only "achieved" marks of meals that
  // are in the member's plan for that week count.
  async weekCompletion(
    userId: number,
    weekStart: string,
  ): Promise<Record<string, DayCompletion>> {
    const dates = getWeekDates(weekStart);
    const rows = await this.dataSource.manager.query<
      { date: string; mealId: number; achieved: boolean | null }[]
    >(
      `SELECT d.date, m.id AS "mealId", k.achieved
         FROM meal_plan_days d
         JOIN meal_plan_meals m ON m.day_id = d.id
         LEFT JOIN meal_marks k ON k.meal_id = m.id
        WHERE d.user_id = $1 AND d.date BETWEEN $2 AND $3`,
      [userId, dates[0], dates[dates.length - 1]],
    );
    const mealIdsByDate = new Map<string, number[]>();

    for (const row of rows) {
      mealIdsByDate.set(row.date, [
        ...(mealIdsByDate.get(row.date) ?? []),
        row.mealId,
      ]);
    }

    return buildWeekCompletion(
      dates,
      mealIdsByDate,
      rows.filter((row) => row.achieved === true).map((row) => row.mealId),
    );
  }

  async countPlanDays(userId: number, weekStart: string) {
    const dates = getWeekDates(weekStart);

    return (await this.planDates(userId, dates[0], dates[6])).length;
  }

  async planDates(userId: number, from: string, to: string) {
    return (
      await this.store.listDaysInRange(
        this.dataSource.manager,
        userId,
        from,
        to,
      )
    ).map((day) => day.date);
  }

  // S3: planned days from `from` onward (a few weeks) whose kcal are further
  // than ON_TARGET.kcalDiff from the target that applies on that date now.
  async planKcalNoticesFrom(
    userId: number,
    from: string,
  ): Promise<PlanKcalNotice[]> {
    const days = await this.store.listDaysInRange(
      this.dataSource.manager,
      userId,
      from,
      addDays(from, NOTICE_HORIZON_DAYS),
    );

    if (days.length === 0) {
      return [];
    }

    const rows = await this.dataSource.manager.query<
      {
        dayId: number;
        grams: number;
        protein: number;
        carbs: number;
        fat: number;
      }[]
    >(
      `SELECT m.day_id AS "dayId", i.grams, f.protein, f.carbs, f.fat
         FROM meal_plan_items i
         JOIN meal_plan_meals m ON m.id = i.meal_id
         JOIN foods f ON f.id = i.food_id
        WHERE m.day_id = ANY($1)`,
      [days.map((day) => day.id)],
    );
    const targets = await this.nutrition.listTargets(userId);

    return getPlanKcalNotices(
      days.map((day) => {
        const target = findTargetForDate(targets, day.date);

        return {
          date: day.date,
          plannedKcal: calculateCalories(
            sumMacros(
              rows
                .filter((row) => row.dayId === day.id)
                .map((row) => macrosOf(row, row.grams)),
            ),
          ),
          targetKcal: target ? calculateCalories(target) : null,
        };
      }),
    );
  }
}
