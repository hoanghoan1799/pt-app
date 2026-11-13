import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type AddItemBody,
  type AutoSolveBody,
  type CreateDayPlanBody,
  MEAL_PLAN_LIMITS,
  type PlanDayResponse,
  type RenameMealBody,
  type ReorderMealsBody,
  type SetMealSharesBody,
  type UpdateItemGramsBody,
} from "@pt/contracts";
import { DataSource, type EntityManager } from "typeorm";

import type { AdminActor } from "../auth/actor.js";
import { MealPlanDay } from "../database/entities/meal-plan-day.entity.js";
import { MealPlanItem } from "../database/entities/meal-plan-item.entity.js";
import { MealPlanMeal } from "../database/entities/meal-plan-meal.entity.js";
import { User } from "../database/entities/user.entity.js";
import { FoodFactsService } from "../foods/food-facts.service.js";
import { MealPlanQueries } from "./meal-plan.queries.js";
import { MealPlanStore } from "./meal-plan.store.js";
import { isUniqueViolation, planErrors } from "./nutrition.errors.js";
import { NutritionQueries } from "./nutrition.queries.js";
import { PlanScope } from "./plan-scope.js";
import {
  getDefaultMealNames,
  getNextMealName,
  resolveMealCount,
} from "./rules/default-meals.js";
import { splitDayTarget } from "./rules/meal-targets.js";
import { solveGrams } from "./rules/solve-grams.js";

const DEFAULT_ITEM_GRAMS = 100;

// The PT's meal plan editing: days, meals, items, shares and the auto solve.
// Routes that name a day, meal or item (not a trainee) are scoped here: a
// resource outside the PT's workspace is answered like a missing one.
@Injectable()
export class MealPlansService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly store: MealPlanStore,
    private readonly queries: MealPlanQueries,
    private readonly nutrition: NutritionQueries,
    private readonly foods: FoodFactsService,
    private readonly scope: PlanScope,
  ) {}

  private get manager() {
    return this.dataSource.manager;
  }

  private async ownDay(admin: AdminActor, dayId: number) {
    const day = await this.store.findDay(this.manager, dayId);

    if (!day || !(await this.scope.canAccess(admin, day.userId))) {
      throw planErrors.dayNotFound();
    }
    return day;
  }

  private async ownMeal(admin: AdminActor, mealId: number) {
    const found = await this.store.findMeal(this.manager, mealId);

    if (!found || !(await this.scope.canAccess(admin, found.day.userId))) {
      throw planErrors.mealNotFound();
    }
    return found;
  }

  private async ownItem(admin: AdminActor, itemId: number) {
    const found = await this.store.findItem(this.manager, itemId);

    if (!found || !(await this.scope.canAccess(admin, found.day.userId))) {
      throw planErrors.itemNotFound();
    }
    return found;
  }

  // Serialises writers of one day, so the count and position checks below see
  // fresh data.
  private lockDay(manager: EntityManager, dayId: number) {
    return manager.query(`SELECT id FROM meal_plan_days WHERE id = $1 FOR UPDATE`, [
      dayId,
    ]);
  }

  private async view(dayId: number): Promise<PlanDayResponse> {
    const day = await this.queries.planDay(dayId);

    if (!day) {
      throw planErrors.dayNotFound();
    }
    return day;
  }

  // Creates the plan of a day with the default meals: the trainee's request
  // when there is one, else 3 (Q2).
  async createDay(
    userId: number,
    body: CreateDayPlanBody,
  ): Promise<PlanDayResponse> {
    const member = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: userId }, select: { id: true, preferredMealCount: true } });

    if (!member) {
      throw planErrors.memberNotFound();
    }

    const names = getDefaultMealNames(
      resolveMealCount(member.preferredMealCount),
    );

    try {
      const dayId = await this.dataSource.transaction(async (manager) => {
        const day = await manager.save(
          manager.create(MealPlanDay, { userId, date: body.date }),
        );

        await manager.insert(
          MealPlanMeal,
          names.map((name, position) => ({
            dayId: day.id,
            userId,
            position,
            name,
          })),
        );
        return day.id;
      });

      return await this.view(dayId);
    } catch (caught) {
      // The day got a plan between the page load and this call.
      if (isUniqueViolation(caught)) {
        throw planErrors.planExists();
      }
      throw caught;
    }
  }

  async deleteDay(admin: AdminActor, dayId: number) {
    const day = await this.ownDay(admin, dayId);

    await this.dataSource.transaction((manager) =>
      this.store.deleteDays(manager, [day.id]),
    );
  }

  async addMeal(admin: AdminActor, dayId: number) {
    const day = await this.ownDay(admin, dayId);

    await this.dataSource.transaction(async (manager) => {
      await this.lockDay(manager, day.id);

      const meals = await this.store.listDayMeals(manager, day.id);

      if (meals.length >= MEAL_PLAN_LIMITS.MAX_MEALS_PER_DAY) {
        throw planErrors.tooManyMeals();
      }
      await manager.insert(MealPlanMeal, {
        dayId: day.id,
        userId: day.userId,
        position: meals.length ? meals[meals.length - 1].position + 1 : 0,
        name: getNextMealName(meals.map((meal) => meal.name)),
      });
      // A custom split would no longer total 100: back to equal.
      await manager.update(MealPlanMeal, { dayId: day.id }, { sharePercent: null });
    });
    return this.view(day.id);
  }

  async removeMeal(admin: AdminActor, mealId: number) {
    const found = await this.ownMeal(admin, mealId);

    await this.dataSource.transaction(async (manager) => {
      await this.lockDay(manager, found.day.id);

      const meals = await this.store.listDayMeals(manager, found.day.id);

      if (
        meals.length <= 1 ||
        !meals.some((meal) => meal.id === found.meal.id)
      ) {
        throw planErrors.lastMeal();
      }
      // Items, the trainee's logs and marks go with the meal (ON DELETE CASCADE).
      await manager.delete(MealPlanMeal, found.meal.id);

      const rest = meals.filter((meal) => meal.id !== found.meal.id);

      for (const [position, meal] of rest.entries()) {
        await manager.update(
          MealPlanMeal,
          { id: meal.id },
          { position, sharePercent: null },
        );
      }
    });
    return this.view(found.day.id);
  }

  async renameMeal(admin: AdminActor, mealId: number, body: RenameMealBody) {
    const found = await this.ownMeal(admin, mealId);

    await this.manager.update(
      MealPlanMeal,
      { id: found.meal.id },
      { name: body.name },
    );
    return this.view(found.day.id);
  }

  // `mealIds` is the new order; it must list exactly the meals of the day.
  async reorderMeals(admin: AdminActor, dayId: number, body: ReorderMealsBody) {
    const day = await this.ownDay(admin, dayId);
    const meals = await this.store.listDayMeals(this.manager, day.id);
    const known = new Set(meals.map((meal) => meal.id));

    if (
      body.mealIds.length !== meals.length ||
      new Set(body.mealIds).size !== meals.length ||
      !body.mealIds.every((id) => known.has(id))
    ) {
      throw planErrors.reorderMismatch();
    }

    await this.dataSource.transaction(async (manager) => {
      for (const [position, mealId] of body.mealIds.entries()) {
        await manager.update(MealPlanMeal, { id: mealId }, { position });
      }
    });
    return this.view(day.id);
  }

  // Q4: a percent per meal, total 100; `shares: null` goes back to equal.
  async setMealShares(
    admin: AdminActor,
    dayId: number,
    body: SetMealSharesBody,
  ) {
    const day = await this.ownDay(admin, dayId);
    const meals = await this.store.listDayMeals(this.manager, day.id);
    const percentById = new Map<number, number | null>(
      meals.map((meal) => [meal.id, null]),
    );

    if (body.shares) {
      const listed = new Set(body.shares.map((share) => share.mealId));

      if (
        body.shares.length !== meals.length ||
        listed.size !== meals.length ||
        !body.shares.every((share) => percentById.has(share.mealId))
      ) {
        throw planErrors.reorderMismatch();
      }
      for (const share of body.shares) {
        percentById.set(share.mealId, share.percent);
      }

      const split = splitDayTarget(
        { carbs: 0, protein: 0, fat: 0 },
        meals.map((meal) => percentById.get(meal.id) ?? null),
      );

      if (!split.ok) {
        throw planErrors.sharesTotal();
      }
    }

    await this.dataSource.transaction(async (manager) => {
      for (const [mealId, sharePercent] of percentById) {
        await manager.update(MealPlanMeal, { id: mealId }, { sharePercent });
      }
    });
    return this.view(day.id);
  }

  async addItem(admin: AdminActor, mealId: number, body: AddItemBody) {
    const found = await this.ownMeal(admin, mealId);
    // Archived foods stay in plans that have them but can't be added anew.
    const food = await this.foods.findActive(body.foodId);

    if (!food) {
      throw planErrors.foodNotFound();
    }

    await this.dataSource.transaction(async (manager) => {
      await this.lockDay(manager, found.day.id);

      const items = await this.store.listMealItems(manager, found.meal.id);

      if (items.some((item) => item.foodId === food.id)) {
        throw planErrors.foodAlreadyInMeal();
      }
      if (items.length >= MEAL_PLAN_LIMITS.MAX_ITEMS_PER_MEAL) {
        throw planErrors.tooManyItems();
      }
      await manager.insert(MealPlanItem, {
        mealId: found.meal.id,
        foodId: food.id,
        grams: body.grams ?? DEFAULT_ITEM_GRAMS,
      });
    });
    return this.view(found.day.id);
  }

  async removeItem(admin: AdminActor, itemId: number) {
    const found = await this.ownItem(admin, itemId);

    await this.manager.delete(MealPlanItem, found.item.id);
    return this.view(found.day.id);
  }

  async updateItemGrams(
    admin: AdminActor,
    itemId: number,
    body: UpdateItemGramsBody,
  ) {
    const found = await this.ownItem(admin, itemId);

    await this.manager.update(
      MealPlanItem,
      { id: found.item.id },
      { grams: body.grams },
    );
    return this.view(found.day.id);
  }

  // Q5: sets the grams of the meal's foods (except the fixed ones) so the meal
  // reaches its share of the day target. Rounded to 5 g; the gap it leaves is
  // worked out again from the saved grams.
  async autoSolve(admin: AdminActor, mealId: number, body: AutoSolveBody) {
    const found = await this.ownMeal(admin, mealId);
    const target = await this.nutrition.targetForDate(
      found.day.userId,
      found.day.date,
    );

    if (!target) {
      throw planErrors.noTarget();
    }

    const meals = await this.store.listDayMeals(this.manager, found.day.id);
    const split = splitDayTarget(
      target,
      meals.map((meal) => meal.sharePercent),
    );
    const mealIndex = meals.findIndex((meal) => meal.id === found.meal.id);

    if (!split.ok) {
      throw planErrors.sharesTotal();
    }

    const items = await this.store.listMealItems(this.manager, found.meal.id);
    const itemIds = new Set(items.map((item) => item.id));

    if (!body.fixedItemIds.every((id) => itemIds.has(id))) {
      throw planErrors.itemNotFound();
    }

    const fixedIds = new Set(body.fixedItemIds);
    const toSolve = items.filter((item) => !fixedIds.has(item.id));

    if (toSolve.length === 0) {
      throw planErrors.nothingToSolve();
    }

    const result = solveGrams({
      target: split.meals[mealIndex],
      // Each item is solved as its own "food": the solver's id is the item id.
      foods: toSolve,
      fixed: items
        .filter((item) => fixedIds.has(item.id))
        .map((item) => ({ food: item, grams: item.grams })),
    });

    // Never store what the solver could not make sense of.
    if (
      !result.grams.every(
        ({ grams }) =>
          Number.isFinite(grams) &&
          grams >= 0 &&
          grams <= MEAL_PLAN_LIMITS.MAX_GRAMS,
      )
    ) {
      throw planErrors.invalidInput();
    }

    await this.dataSource.transaction(async (manager) => {
      for (const { foodId: itemId, grams } of result.grams) {
        // `foodId` here is the item id passed in above.
        await manager.update(MealPlanItem, { id: itemId }, { grams });
      }
    });
    return this.view(found.day.id);
  }
}
