import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  type AddMealLogBody,
  addMealLogBodySchema,
  dateParamSchema,
  type FoodEntryBody,
  foodEntryBodySchema,
  foodEntryResponseSchema,
  idParamSchema,
  mealLogResponseSchema,
  mealPlanWeekResponseSchema,
  mealPreferencesResponseSchema,
  mealPreferencesSchema,
  type MyBodyProfileBody,
  myBodyProfileSchema,
  nutritionOverviewResponseSchema,
  saveBodyProfileResponseSchema,
  saveWeightResponseSchema,
  type SetMealMarkBody,
  setMealMarkBodySchema,
  setMealMarkResponseSchema,
  type UpdateMealLogBody,
  updateMealLogBodySchema,
  type WeekQuery,
  weekQuerySchema,
  type WeightLogBody,
  weightLogSchema,
} from "@pt/contracts";

import type { UserActor } from "../auth/actor.js";
import { Actor, User } from "../auth/decorators/index.js";
import { BodyProfileService } from "./body-profile.service.js";
import { MealLogsService } from "./meal-logs.service.js";
import { MealPlanReadService } from "./meal-plan-read.service.js";
import {
  type MealPreferencesBody,
  MealPreferencesService,
} from "./meal-preferences.service.js";
import { NutritionService } from "./nutrition.service.js";
import { ApiRoute } from "./route-docs.js";

// The signed-in trainee's own nutrition: food log, body profile, weigh-ins,
// meal plan, meal log and marks. HTTP only; the rules live in the services.
@ApiTags("nutrition")
@Controller("me")
@User()
export class TraineeNutritionController {
  constructor(
    private readonly nutrition: NutritionService,
    private readonly bodyProfile: BodyProfileService,
    private readonly mealPlan: MealPlanReadService,
    private readonly logs: MealLogsService,
    private readonly preferences: MealPreferencesService,
  ) {}

  @Get("nutrition")
  @ApiRoute({
    summary: "Week of daily totals, summary, body profile and weight chart",
    response: nutritionOverviewResponseSchema,
    errors: [400, 401, 403],
  })
  overview(
    @Actor() actor: UserActor,
    @Query({ schema: weekQuerySchema }) query: WeekQuery,
  ) {
    return this.nutrition.overview(actor.id, query.week);
  }

  @Put("body-profile")
  @ApiRoute({
    summary: "Save my measurements; the target follows the TDEE unless manual",
    body: myBodyProfileSchema,
    response: saveBodyProfileResponseSchema,
  })
  saveBodyProfile(
    @Actor() actor: UserActor,
    @Body({ schema: myBodyProfileSchema }) body: MyBodyProfileBody,
  ) {
    return this.bodyProfile.saveForTrainee(actor.id, body);
  }

  @Put("weight-logs/:date")
  @ApiRoute({
    summary: "Record a weigh-in (one per day; saving again replaces it)",
    body: weightLogSchema,
    response: saveWeightResponseSchema,
  })
  logWeight(
    @Actor() actor: UserActor,
    @Param("date", { schema: dateParamSchema }) date: string,
    @Body({ schema: weightLogSchema }) body: WeightLogBody,
  ) {
    return this.bodyProfile.logWeight(actor.id, date, body.weightKg);
  }

  @Post("food-entries")
  @ApiRoute({
    summary: "Log a free-text meal for today or an earlier day",
    body: foodEntryBodySchema,
    response: foodEntryResponseSchema,
    status: 201,
  })
  createEntry(
    @Actor() actor: UserActor,
    @Body({ schema: foodEntryBodySchema }) body: FoodEntryBody,
  ) {
    return this.nutrition.saveEntry(actor.id, null, body);
  }

  @Put("food-entries/:id")
  @ApiRoute({
    summary: "Edit one of my food entries (the date stays)",
    body: foodEntryBodySchema,
    response: foodEntryResponseSchema,
    errors: [400, 401, 403, 404],
  })
  updateEntry(
    @Actor() actor: UserActor,
    @Param("id", { schema: idParamSchema }) id: number,
    @Body({ schema: foodEntryBodySchema }) body: FoodEntryBody,
  ) {
    return this.nutrition.saveEntry(actor.id, id, body);
  }

  @Delete("food-entries/:id")
  @HttpCode(204)
  @ApiRoute({
    summary: "Delete one of my food entries (no error when it is gone)",
    status: 204,
  })
  async deleteEntry(
    @Actor() actor: UserActor,
    @Param("id", { schema: idParamSchema }) id: number,
  ) {
    await this.nutrition.deleteEntry(actor.id, id);
  }

  @Get("meal-plan-days")
  @ApiRoute({
    summary: "My meal plan for a week with my logs, marks and completion",
    response: mealPlanWeekResponseSchema,
  })
  mealPlanWeek(
    @Actor() actor: UserActor,
    @Query({ schema: weekQuerySchema }) query: WeekQuery,
  ) {
    return this.mealPlan.week(actor.id, query.week);
  }

  @Put("meal-preferences")
  @ApiRoute({
    summary: "Save my request to the PT: meals per day and a food note",
    body: mealPreferencesSchema,
    response: mealPreferencesResponseSchema,
  })
  savePreferences(
    @Actor() actor: UserActor,
    @Body({ schema: mealPreferencesSchema }) body: MealPreferencesBody,
  ) {
    return this.preferences.save(actor.id, body);
  }

  @Post("meals/:mealId/logs")
  @ApiRoute({
    summary: "Log a library or free food in one of my planned meals",
    body: addMealLogBodySchema,
    response: mealLogResponseSchema,
    status: 201,
    errors: [400, 401, 403, 404, 409],
  })
  addLog(
    @Actor() actor: UserActor,
    @Param("mealId", { schema: idParamSchema }) mealId: number,
    @Body({ schema: addMealLogBodySchema }) body: AddMealLogBody,
  ) {
    return this.logs.addLog(actor.id, mealId, body);
  }

  @Patch("meal-logs/:id")
  @ApiRoute({
    summary: "Edit one of my meal logs",
    body: updateMealLogBodySchema,
    response: mealLogResponseSchema,
    errors: [400, 401, 403, 404, 409],
  })
  updateLog(
    @Actor() actor: UserActor,
    @Param("id", { schema: idParamSchema }) id: number,
    @Body({ schema: updateMealLogBodySchema }) body: UpdateMealLogBody,
  ) {
    return this.logs.updateLog(actor.id, id, body);
  }

  @Delete("meal-logs/:id")
  @HttpCode(204)
  @ApiRoute({
    summary: "Remove one of my meal logs",
    status: 204,
    errors: [400, 401, 403, 404],
  })
  async removeLog(
    @Actor() actor: UserActor,
    @Param("id", { schema: idParamSchema }) id: number,
  ) {
    await this.logs.removeLog(actor.id, id);
  }

  @Put("meals/:mealId/mark")
  @ApiRoute({
    summary: 'Mark a meal "Đạt" and/or leave a note; nothing set removes it',
    body: setMealMarkBodySchema,
    response: setMealMarkResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async setMark(
    @Actor() actor: UserActor,
    @Param("mealId", { schema: idParamSchema }) mealId: number,
    @Body({ schema: setMealMarkBodySchema }) body: SetMealMarkBody,
  ) {
    return { mark: await this.logs.setMark(actor.id, mealId, body) };
  }
}
