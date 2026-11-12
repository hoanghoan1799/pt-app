import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module.js";
import { User } from "../database/entities/user.entity.js";
import { BodyProfileService } from "./body-profile.service.js";
import { FoodsReader } from "./foods-reader.js";
import { MealLogsService } from "./meal-logs.service.js";
import { MealPlanQueries } from "./meal-plan.queries.js";
import { MealPlanStore } from "./meal-plan.store.js";
import { MealPlanCopyService } from "./meal-plan-copy.service.js";
import { MealPlanReadService } from "./meal-plan-read.service.js";
import { MealPlansController } from "./meal-plans.controller.js";
import { MealPlansService } from "./meal-plans.service.js";
import { MealPreferencesService } from "./meal-preferences.service.js";
import { NutritionQueries } from "./nutrition.queries.js";
import { NutritionService } from "./nutrition.service.js";
import { PlanScope } from "./plan-scope.js";
import { PtNutritionController } from "./pt-nutrition.controller.js";
import {
  ManualTarget,
  TargetCalculator,
  TdeeTarget,
} from "./targets/target-strategy.js";
import { TargetsService } from "./targets/targets.service.js";
import { TraineeNutritionController } from "./trainee-nutrition.controller.js";

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [
    TraineeNutritionController,
    PtNutritionController,
    MealPlansController,
  ],
  providers: [
    // Nutrition target strategies (manual vs TDEE) and the context that picks
    // one by source. Another formula is one more class in this list.
    ManualTarget,
    TdeeTarget,
    {
      provide: TargetCalculator,
      useFactory: (...strategies: (ManualTarget | TdeeTarget)[]) =>
        new TargetCalculator(strategies),
      inject: [ManualTarget, TdeeTarget],
    },
    TargetsService,
    NutritionQueries,
    NutritionService,
    BodyProfileService,
    FoodsReader,
    MealPlanStore,
    MealPlanQueries,
    MealPlanReadService,
    MealPlansService,
    MealPlanCopyService,
    MealLogsService,
    MealPreferencesService,
    PlanScope,
  ],
})
export class NutritionModule {}
