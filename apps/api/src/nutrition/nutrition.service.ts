import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type FoodEntryBody,
  type FoodEntryResponse,
  getTodayDate,
  getWeekStart,
  type NutritionOverviewResponse,
  type NutritionTargetResponse,
  type TargetBody,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { FoodEntry } from "../database/entities/food-entry.entity.js";
import {
  toBodyProfileDetail,
  toDayResponse,
  toEntryResponse,
  toTargetResponse,
} from "./mappers.js";
import { nutritionErrors } from "./nutrition.errors.js";
import { NutritionQueries, toEntryRow } from "./nutrition.queries.js";
import { summarizeNutritionWeek } from "./rules/nutrition-math.js";
import { getWeightChanges, WEIGHT_CHART_WEEKS } from "./rules/weight.js";
import { TargetsService } from "./targets/targets.service.js";

// Targets, food entries and the nutrition overview (daily and weekly
// summaries, body profile, weight chart).
@Injectable()
export class NutritionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queries: NutritionQueries,
    private readonly targets: TargetsService,
    private readonly clock: Clock,
  ) {}

  today() {
    return getTodayDate(undefined, this.clock.now());
  }

  // The week view: daily totals against the target, the weekly summary, the
  // body profile with its energy plan and the 12-week weight chart.
  async overview(
    userId: number,
    week?: string,
  ): Promise<NutritionOverviewResponse> {
    const today = this.today();
    const weekStart = getWeekStart(week ?? today);
    const [days, latestTarget, profile, weightWeeks, todayWeight] =
      await Promise.all([
        this.queries.nutritionWeek(userId, weekStart),
        this.queries.latestTarget(userId),
        this.queries.bodyProfile(userId),
        this.queries.weightTrend(userId, weekStart, WEIGHT_CHART_WEEKS),
        this.queries.todayWeight(userId, today),
      ]);

    return {
      today,
      weekStart,
      latestTarget: latestTarget ? toTargetResponse(latestTarget) : null,
      bodyProfile: profile ? toBodyProfileDetail(profile, today) : null,
      days: days.map(toDayResponse),
      summary: summarizeNutritionWeek(days),
      weightWeeks,
      weightChange: getWeightChanges(weightWeeks),
      todayWeight,
    };
  }

  // Admin: sets the daily target from today on; earlier days keep theirs.
  async saveTarget(
    userId: number,
    body: TargetBody,
  ): Promise<NutritionTargetResponse> {
    const target = await this.dataSource.transaction((manager) =>
      this.targets.saveManual(manager, userId, body, this.today()),
    );

    return toTargetResponse(target);
  }

  // Trainee: logs (or edits) a meal for today or an earlier day. An edit keeps
  // the entry's date.
  async saveEntry(
    userId: number,
    entryId: number | null,
    body: FoodEntryBody,
  ): Promise<FoodEntryResponse> {
    const { date, ...values } = body;
    const hasAmount = [values.carbs, values.protein, values.fat].some(
      (grams) => grams !== null,
    );

    if (!values.description && !hasAmount) {
      throw nutritionErrors.entryEmpty();
    }
    if (date > this.today()) {
      throw nutritionErrors.futureDate();
    }

    const repository = this.dataSource.getRepository(FoodEntry);

    if (entryId !== null) {
      const updated = await repository.update({ id: entryId, userId }, values);

      if (!updated.affected) {
        throw nutritionErrors.entryNotFound();
      }

      const row = await repository.findOneByOrFail({ id: entryId, userId });

      return toEntryResponse(toEntryRow(row));
    }

    const row = await repository.save(
      repository.create({ ...values, date, userId }),
    );

    return toEntryResponse(toEntryRow(row));
  }

  async deleteEntry(userId: number, entryId: number) {
    await this.dataSource
      .getRepository(FoodEntry)
      .delete({ id: entryId, userId });
  }
}
