import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiParam, ApiTags } from "@nestjs/swagger";
import {
  type ApplyLastWeekBody,
  applyLastWeekBodySchema,
  type BodyProfileBody,
  bodyProfileBodySchema,
  type CopyInfoQuery,
  copyInfoQuerySchema,
  type CopyMealPlanDayBody,
  copyMealPlanDayBodySchema,
  copyPlanResultResponseSchema,
  type CreateDayPlanBody,
  createDayPlanBodySchema,
  mealPlanCopyInfoResponseSchema,
  nutritionOverviewResponseSchema,
  nutritionTargetResponseSchema,
  planDayResponseSchema,
  saveBodyProfileResponseSchema,
  type TargetBody,
  targetBodySchema,
  traineeMealPlanWeekResponseSchema,
  type WeekQuery,
  weekQuerySchema,
} from "@pt/contracts";

import { Admin, ScopedToTrainee } from "../auth/decorators/index.js";
import { BodyProfileService } from "./body-profile.service.js";
import { MealPlanCopyService } from "./meal-plan-copy.service.js";
import { MealPlanReadService } from "./meal-plan-read.service.js";
import { MealPlansService } from "./meal-plans.service.js";
import { NutritionService } from "./nutrition.service.js";
import { ApiRoute } from "./route-docs.js";
import { ScopedUserId } from "./scoped-user.js";

// A PT's view of one trainee's nutrition and meal plans. Every route is scoped
// to the trainee in `:userId` (PtScopeGuard): own workspace only, hidden
// trainees need a reveal.
@ApiTags("nutrition")
// `@ScopedUserId()` reads the id itself, so Swagger needs the path parameter.
@ApiParam({ name: "userId", type: Number })
@Controller("trainees/:userId")
@Admin()
@ScopedToTrainee()
export class PtNutritionController {
  constructor(
    private readonly nutrition: NutritionService,
    private readonly bodyProfile: BodyProfileService,
    private readonly mealPlanRead: MealPlanReadService,
    private readonly plans: MealPlansService,
    private readonly copy: MealPlanCopyService,
  ) {}

  @Get("nutrition")
  @ApiRoute({
    summary: "A trainee's week of totals, summary, body profile, weight chart",
    response: nutritionOverviewResponseSchema,
    errors: [400, 401, 403, 404],
  })
  overview(
    @ScopedUserId() userId: number,
    @Query({ schema: weekQuerySchema }) query: WeekQuery,
  ) {
    return this.nutrition.overview(userId, query.week);
  }

  @Put("nutrition-target")
  @ApiRoute({
    summary: "Set the daily target from today on (earlier days keep theirs)",
    body: targetBodySchema,
    response: nutritionTargetResponseSchema,
    errors: [400, 401, 403, 404],
  })
  saveTarget(
    @ScopedUserId() userId: number,
    @Body({ schema: targetBodySchema }) body: TargetBody,
  ) {
    return this.nutrition.saveTarget(userId, body);
  }

  @Put("body-profile")
  @ApiRoute({
    summary: "Save the measurements and the energy model; optionally the TDEE",
    body: bodyProfileBodySchema,
    response: saveBodyProfileResponseSchema,
    errors: [400, 401, 403, 404],
  })
  saveBodyProfile(
    @ScopedUserId() userId: number,
    @Body({ schema: bodyProfileBodySchema }) body: BodyProfileBody,
  ) {
    return this.bodyProfile.saveForAdmin(userId, body);
  }

  @Get("meal-plan-days")
  @ApiRoute({
    summary: "The week's meal plan with logs, marks, notices and copy data",
    response: traineeMealPlanWeekResponseSchema,
    errors: [400, 401, 403, 404],
  })
  mealPlanWeek(
    @ScopedUserId() userId: number,
    @Query({ schema: weekQuerySchema }) query: WeekQuery,
  ) {
    return this.mealPlanRead.traineeWeek(userId, query.week);
  }

  @Get("meal-plan-days/copy-info")
  @ApiRoute({
    summary: "Plan dates and log dates in a range (the copy sheet's months)",
    response: mealPlanCopyInfoResponseSchema,
    errors: [400, 401, 403, 404],
  })
  copyInfo(
    @ScopedUserId() userId: number,
    @Query({ schema: copyInfoQuerySchema }) query: CopyInfoQuery,
  ) {
    return this.copy.copyInfo(userId, query);
  }

  @Post("meal-plan-days")
  @ApiRoute({
    summary: "Create the plan of a day with the default meals",
    body: createDayPlanBodySchema,
    response: planDayResponseSchema,
    status: 201,
    errors: [400, 401, 403, 404, 409],
  })
  createDay(
    @ScopedUserId() userId: number,
    @Body({ schema: createDayPlanBodySchema }) body: CreateDayPlanBody,
  ) {
    return this.plans.createDay(userId, body);
  }

  @Post("meal-plan-days/copy")
  @HttpCode(200)
  @ApiRoute({
    summary: "Copy a day to other dates (existing plans there are replaced)",
    body: copyMealPlanDayBodySchema,
    response: copyPlanResultResponseSchema,
    errors: [400, 401, 403, 404],
  })
  copyDay(
    @ScopedUserId() userId: number,
    @Body({ schema: copyMealPlanDayBodySchema }) body: CopyMealPlanDayBody,
  ) {
    return this.copy.copyDay(userId, body);
  }

  @Post("meal-plan-days/apply-last-week")
  @HttpCode(200)
  @ApiRoute({
    summary: "Copy last week's plans to this week; days with a plan are kept",
    body: applyLastWeekBodySchema,
    response: copyPlanResultResponseSchema,
    errors: [400, 401, 403, 404],
  })
  applyLastWeek(
    @ScopedUserId() userId: number,
    @Body({ schema: applyLastWeekBodySchema }) body: ApplyLastWeekBody,
  ) {
    return this.copy.applyLastWeek(userId, body);
  }
}
