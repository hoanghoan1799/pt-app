import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";
import { ExercisesController } from "./exercises.controller.js";
import { ExercisesService } from "./exercises.service.js";
import { InsightsQueries } from "./insights.queries.js";
import { ScheduleQueries } from "./schedule.queries.js";
import { TraineeWorkoutsController } from "./trainee-workouts.controller.js";
import { TraineeWorkoutsService } from "./trainee-workouts.service.js";
import { WorkoutDaysController } from "./workout-days.controller.js";
import { WorkoutDaysService } from "./workout-days.service.js";
import { WorkoutsPolicy } from "./workouts.policy.js";

// Workout days, exercises, logged sets, completions, the copy operations and
// the admin progress reads. Queries run on the DataSource directly (raw SQL
// read models), services own the transactions.
@Module({
  imports: [AuthModule],
  controllers: [
    TraineeWorkoutsController,
    WorkoutDaysController,
    ExercisesController,
    DashboardController,
  ],
  providers: [
    ScheduleQueries,
    InsightsQueries,
    WorkoutsPolicy,
    WorkoutDaysService,
    ExercisesService,
    TraineeWorkoutsService,
    DashboardService,
  ],
})
export class WorkoutsModule {}
