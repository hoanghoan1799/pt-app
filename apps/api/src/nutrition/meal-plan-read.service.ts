import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  addDays,
  getTodayDate,
  getWeekStart,
  type MealPlanWeekResponse,
  type TraineeMealPlanWeekResponse,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { User } from "../database/entities/user.entity.js";
import { MealPlanQueries } from "./meal-plan.queries.js";
import { planErrors } from "./nutrition.errors.js";

// The meal plan of a week with the trainee's logs and marks: what the trainee
// sees, and what the PT sees (plus the copy sheet and kcal notices data).
@Injectable()
export class MealPlanReadService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queries: MealPlanQueries,
    private readonly clock: Clock,
  ) {}

  private async preferences(userId: number) {
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: userId },
      select: { id: true, preferredMealCount: true, foodNote: true },
    });

    if (!user) {
      throw planErrors.memberNotFound();
    }
    return {
      preferredMealCount: user.preferredMealCount,
      foodNote: user.foodNote,
    };
  }

  async week(userId: number, week?: string): Promise<MealPlanWeekResponse> {
    const weekStart = getWeekStart(
      week ?? getTodayDate(undefined, this.clock.now()),
    );
    const [days, completion, preferences] = await Promise.all([
      this.queries.planWeek(userId, weekStart),
      this.queries.weekCompletion(userId, weekStart),
      this.preferences(userId),
    ]);
    const { logs, marks } = await this.queries.mealLogData(
      days.flatMap((day) => day.meals.map((meal) => meal.id)),
    );

    return { weekStart, days, completion, logs, marks, preferences };
  }

  async traineeWeek(
    userId: number,
    week?: string,
  ): Promise<TraineeMealPlanWeekResponse> {
    const base = await this.week(userId, week);
    const [lastWeekPlanCount, nextWeekPlanDates, planKcalNotices, datesWithLogs] =
      await Promise.all([
        this.queries.countPlanDays(userId, addDays(base.weekStart, -7)),
        this.queries.planDates(
          userId,
          addDays(base.weekStart, 7),
          addDays(base.weekStart, 13),
        ),
        this.queries.planKcalNoticesFrom(userId, base.weekStart),
        this.queries.datesWithLogs(
          userId,
          base.weekStart,
          addDays(base.weekStart, 13),
        ),
      ]);

    return {
      ...base,
      lastWeekPlanCount,
      nextWeekPlanDates,
      planKcalNotices,
      datesWithLogs,
    };
  }
}
