import { Injectable } from "@nestjs/common";
import { type EntityManager,In } from "typeorm";

import { MealPlanDay } from "../database/entities/meal-plan-day.entity.js";
import { MealPlanItem } from "../database/entities/meal-plan-item.entity.js";
import { MealPlanMeal } from "../database/entities/meal-plan-meal.entity.js";

export type DayRow = { id: number; userId: number; date: string };

export type MealRow = {
  id: number;
  dayId: number;
  position: number;
  name: string;
  sharePercent: number | null;
};

export type ItemRow = {
  id: number;
  mealId: number;
  foodId: number;
  grams: number;
};

export type LoadedPlan = { meals: MealRow[]; items: ItemRow[] };

const toDay = (row: MealPlanDay): DayRow => ({
  id: row.id,
  userId: row.userId,
  date: row.date,
});

const toMeal = (row: MealPlanMeal): MealRow => ({
  id: row.id,
  dayId: row.dayId,
  position: row.position,
  name: row.name,
  sharePercent: row.sharePercent,
});

const toItem = (row: MealPlanItem): ItemRow => ({
  id: row.id,
  mealId: row.mealId,
  foodId: row.foodId,
  grams: row.grams,
});

// Write-side lookups and row operations of the meal plan tables. Every method
// takes the EntityManager so callers decide the transaction. Ownership
// (PT scope) is decided by the service, not here.
@Injectable()
export class MealPlanStore {
  async findDay(manager: EntityManager, dayId: number) {
    const row = await manager
      .getRepository(MealPlanDay)
      .findOne({ where: { id: dayId } });

    return row ? toDay(row) : null;
  }

  async findMeal(manager: EntityManager, mealId: number) {
    const meal = await manager
      .getRepository(MealPlanMeal)
      .findOne({ where: { id: mealId } });

    if (!meal) {
      return null;
    }

    const day = await this.findDay(manager, meal.dayId);

    return day ? { meal: toMeal(meal), day } : null;
  }

  async findItem(manager: EntityManager, itemId: number) {
    const item = await manager
      .getRepository(MealPlanItem)
      .findOne({ where: { id: itemId } });

    if (!item) {
      return null;
    }

    const found = await this.findMeal(manager, item.mealId);

    return found ? { item: toItem(item), ...found } : null;
  }

  async listDayMeals(manager: EntityManager, dayId: number) {
    const rows = await manager.getRepository(MealPlanMeal).find({
      where: { dayId },
      order: { position: "ASC", id: "ASC" },
    });

    return rows.map(toMeal);
  }

  // Items of a meal with the food's macros per 100 g, archived or not.
  listMealItems(manager: EntityManager, mealId: number) {
    return manager.query<
      (ItemRow & { protein: number; carbs: number; fat: number })[]
    >(
      `SELECT i.id, i.meal_id AS "mealId", i.food_id AS "foodId", i.grams,
              f.protein, f.carbs, f.fat
         FROM meal_plan_items i
         JOIN foods f ON f.id = i.food_id
        WHERE i.meal_id = $1
        ORDER BY i.id`,
      [mealId],
    );
  }

  // Plan days of a member from `from` to `to` (inclusive), oldest first.
  async listDaysInRange(
    manager: EntityManager,
    userId: number,
    from: string,
    to: string,
  ) {
    const rows = await manager.query<DayRow[]>(
      `SELECT id, user_id AS "userId", date
         FROM meal_plan_days
        WHERE user_id = $1 AND date BETWEEN $2 AND $3
        ORDER BY date`,
      [userId, from, to],
    );

    return rows;
  }

  async deleteDays(manager: EntityManager, dayIds: number[]) {
    if (dayIds.length === 0) {
      return;
    }
    // Meals, items, the trainee's logs, marks and frozen items go with the day
    // (ON DELETE CASCADE).
    await manager.delete(MealPlanDay, dayIds);
  }

  // Meals and items of several days in two queries; keyed by day id.
  async loadPlans(manager: EntityManager, dayIds: number[]) {
    const plans = new Map<number, LoadedPlan>(
      dayIds.map((id) => [id, { meals: [], items: [] }]),
    );

    if (dayIds.length === 0) {
      return plans;
    }

    const meals = (
      await manager.getRepository(MealPlanMeal).find({
        where: { dayId: In(dayIds) },
        order: { position: "ASC", id: "ASC" },
      })
    ).map(toMeal);
    const items = meals.length
      ? (
          await manager.getRepository(MealPlanItem).find({
            where: { mealId: In(meals.map((meal) => meal.id)) },
            order: { id: "ASC" },
          })
        ).map(toItem)
      : [];

    for (const meal of meals) {
      const plan = plans.get(meal.dayId);

      plan?.meals.push(meal);
      plan?.items.push(...items.filter((item) => item.mealId === meal.id));
    }
    return plans;
  }

  // Copies a loaded plan to a new day on `date`: one insert for the day, one
  // for its meals and one for its foods. Returns null when the member already
  // has a plan that day (e.g. created a moment ago): that day is skipped.
  async clonePlan(
    manager: EntityManager,
    plan: LoadedPlan,
    userId: number,
    date: string,
  ) {
    const inserted = await manager
      .createQueryBuilder()
      .insert()
      .into(MealPlanDay)
      .values({ userId, date })
      .orIgnore()
      .returning("id")
      .execute();
    const dayId = (inserted.raw as { id: number }[])[0]?.id;

    if (dayId === undefined) {
      return null;
    }
    if (plan.meals.length === 0) {
      return dayId;
    }

    // Identifiers follow the insert order, so copies line up with the sources.
    const copies = await manager.insert(
      MealPlanMeal,
      plan.meals.map((meal) => ({
        dayId,
        position: meal.position,
        name: meal.name,
        sharePercent: meal.sharePercent,
      })),
    );
    const items = plan.items.flatMap((item) => {
      const index = plan.meals.findIndex((meal) => meal.id === item.mealId);

      return index < 0
        ? []
        : [
            {
              mealId: (copies.identifiers[index] as { id: number }).id,
              foodId: item.foodId,
              grams: item.grams,
            },
          ];
    });

    if (items.length > 0) {
      await manager.insert(MealPlanItem, items);
    }
    return dayId;
  }
}
