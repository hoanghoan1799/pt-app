import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  type AddItemBody,
  addItemBodySchema,
  type AutoSolveBody,
  autoSolveBodySchema,
  idParamSchema,
  planDayResponseSchema,
  type RenameMealBody,
  renameMealBodySchema,
  type ReorderMealsBody,
  reorderMealsBodySchema,
  type SetMealSharesBody,
  setMealSharesBodySchema,
  type UpdateItemGramsBody,
  updateItemGramsBodySchema,
} from "@pt/contracts";

import type { AdminActor } from "../auth/actor.js";
import { Actor, Admin } from "../auth/decorators/index.js";
import { MealPlansService } from "./meal-plans.service.js";
import { ApiRoute } from "./route-docs.js";

const ERRORS = [400, 401, 403, 404];

// Editing a meal plan by day, meal and item id. The URL names no trainee, so
// MealPlansService checks the PT's workspace for the owner of each resource;
// a day, meal or item out of scope answers like a missing one. Every edit
// returns the updated day.
@ApiTags("meal-plans")
@Controller()
@Admin()
export class MealPlansController {
  constructor(private readonly plans: MealPlansService) {}

  @Delete("meal-plan-days/:dayId")
  @HttpCode(204)
  @ApiRoute({
    summary: "Delete a day's plan with its meals, foods, logs and marks",
    status: 204,
    errors: ERRORS,
  })
  async deleteDay(
    @Actor() actor: AdminActor,
    @Param("dayId", { schema: idParamSchema }) dayId: number,
  ) {
    await this.plans.deleteDay(actor, dayId);
  }

  @Post("meal-plan-days/:dayId/meals")
  @ApiRoute({
    summary: "Add the next default-named meal (the split goes back to equal)",
    response: planDayResponseSchema,
    status: 201,
    errors: [...ERRORS, 409],
  })
  addMeal(
    @Actor() actor: AdminActor,
    @Param("dayId", { schema: idParamSchema }) dayId: number,
  ) {
    return this.plans.addMeal(actor, dayId);
  }

  @Put("meal-plan-days/:dayId/meals/order")
  @ApiRoute({
    summary: "Reorder the day's meals; the list must be exactly its meals",
    body: reorderMealsBodySchema,
    response: planDayResponseSchema,
    errors: [...ERRORS, 409],
  })
  reorder(
    @Actor() actor: AdminActor,
    @Param("dayId", { schema: idParamSchema }) dayId: number,
    @Body({ schema: reorderMealsBodySchema }) body: ReorderMealsBody,
  ) {
    return this.plans.reorderMeals(actor, dayId, body);
  }

  @Put("meal-plan-days/:dayId/meals/shares")
  @ApiRoute({
    summary: "Set a percent per meal (total 100); null goes back to equal",
    body: setMealSharesBodySchema,
    response: planDayResponseSchema,
    errors: [...ERRORS, 409],
  })
  shares(
    @Actor() actor: AdminActor,
    @Param("dayId", { schema: idParamSchema }) dayId: number,
    @Body({ schema: setMealSharesBodySchema }) body: SetMealSharesBody,
  ) {
    return this.plans.setMealShares(actor, dayId, body);
  }

  @Delete("meals/:mealId")
  @ApiRoute({
    summary: "Remove a meal (not the last one) with its foods and logs",
    response: planDayResponseSchema,
    errors: [...ERRORS, 409],
  })
  removeMeal(
    @Actor() actor: AdminActor,
    @Param("mealId", { schema: idParamSchema }) mealId: number,
  ) {
    return this.plans.removeMeal(actor, mealId);
  }

  @Patch("meals/:mealId")
  @ApiRoute({
    summary: "Rename a meal",
    body: renameMealBodySchema,
    response: planDayResponseSchema,
    errors: ERRORS,
  })
  rename(
    @Actor() actor: AdminActor,
    @Param("mealId", { schema: idParamSchema }) mealId: number,
    @Body({ schema: renameMealBodySchema }) body: RenameMealBody,
  ) {
    return this.plans.renameMeal(actor, mealId, body);
  }

  @Post("meals/:mealId/items")
  @ApiRoute({
    summary: "Add a library food to a meal (100 g unless given)",
    body: addItemBodySchema,
    response: planDayResponseSchema,
    status: 201,
    errors: [...ERRORS, 409],
  })
  addItem(
    @Actor() actor: AdminActor,
    @Param("mealId", { schema: idParamSchema }) mealId: number,
    @Body({ schema: addItemBodySchema }) body: AddItemBody,
  ) {
    return this.plans.addItem(actor, mealId, body);
  }

  @Post("meals/:mealId/auto-solve")
  @HttpCode(200)
  @ApiRoute({
    summary: "Solve the grams of the meal's foods to reach its share of target",
    body: autoSolveBodySchema,
    response: planDayResponseSchema,
    errors: [...ERRORS, 409],
  })
  autoSolve(
    @Actor() actor: AdminActor,
    @Param("mealId", { schema: idParamSchema }) mealId: number,
    @Body({ schema: autoSolveBodySchema }) body: AutoSolveBody,
  ) {
    return this.plans.autoSolve(actor, mealId, body);
  }

  @Delete("meal-items/:itemId")
  @ApiRoute({
    summary: "Remove a food from a meal",
    response: planDayResponseSchema,
    errors: ERRORS,
  })
  removeItem(
    @Actor() actor: AdminActor,
    @Param("itemId", { schema: idParamSchema }) itemId: number,
  ) {
    return this.plans.removeItem(actor, itemId);
  }

  @Patch("meal-items/:itemId")
  @ApiRoute({
    summary: "Change the grams of a planned food",
    body: updateItemGramsBodySchema,
    response: planDayResponseSchema,
    errors: ERRORS,
  })
  updateGrams(
    @Actor() actor: AdminActor,
    @Param("itemId", { schema: idParamSchema }) itemId: number,
    @Body({ schema: updateItemGramsBodySchema }) body: UpdateItemGramsBody,
  ) {
    return this.plans.updateItemGrams(actor, itemId, body);
  }
}
