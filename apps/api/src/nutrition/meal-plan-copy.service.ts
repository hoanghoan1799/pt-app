import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  addDays,
  type ApplyLastWeekBody,
  type CopyInfoQuery,
  type CopyMealPlanDayBody,
  getTodayDate,
  getWeekDates,
  getWeekStart,
} from "@pt/contracts";
import { DataSource, In } from "typeorm";

import { Clock } from "../common/clock.js";
import { MealPlanDay } from "../database/entities/meal-plan-day.entity.js";
import { MealPlanQueries } from "./meal-plan.queries.js";
import { MealPlanStore } from "./meal-plan.store.js";
import { planErrors } from "./nutrition.errors.js";

export type CopyResult = { copied: number; skipped: number };

// Copying plans is one unit of work: the old plans of the target days are
// replaced and the new ones inserted in a single transaction.
@Injectable()
export class MealPlanCopyService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly store: MealPlanStore,
    private readonly queries: MealPlanQueries,
    private readonly clock: Clock,
  ) {}

  // Copies a day to the chosen dates; a date that already has a plan gets it
  // replaced (the client says so before the PT confirms).
  async copyDay(
    userId: number,
    body: CopyMealPlanDayBody,
  ): Promise<CopyResult> {
    const source = await this.store.findDay(
      this.dataSource.manager,
      body.dayId,
    );

    if (!source || source.userId !== userId) {
      throw planErrors.dayNotFound();
    }

    const dates = [...new Set(body.dates)].filter(
      (date) => date !== source.date,
    );

    if (dates.length === 0) {
      throw planErrors.noTargetDays();
    }

    // KAN-121: a past day is never a target. One past date rejects the whole
    // request, so nothing is written and the PT picks again.
    const today = getTodayDate(undefined, this.clock.now());

    if (dates.some((date) => date < today)) {
      throw planErrors.pastTargetDays();
    }

    const copied = await this.dataSource.transaction(async (manager) => {
      const existing = await manager
        .getRepository(MealPlanDay)
        .find({ where: { userId, date: In(dates) }, select: { id: true } });
      const plan = (await this.store.loadPlans(manager, [source.id])).get(
        source.id,
      );

      await this.store.deleteDays(
        manager,
        existing.map((day) => day.id),
      );

      let count = 0;

      for (const date of dates) {
        // Null: a plan for that day appeared a moment ago, skip it.
        if (plan && (await this.store.clonePlan(manager, plan, userId, date))) {
          count += 1;
        }
      }
      return count;
    });

    return { copied, skipped: dates.length - copied };
  }

  // KAN-122: the copy sheet's month picker marks days that already have a plan
  // (and warns about logs) beyond the weeks the client loaded.
  async copyInfo(userId: number, query: CopyInfoQuery) {
    const [planDates, logDates] = await Promise.all([
      this.queries.planDates(userId, query.from, query.to),
      this.queries.datesWithLogs(userId, query.from, query.to),
    ]);

    return { planDates, logDates };
  }

  // R2: copies last week's plans to the same weekdays of `weekStart`'s week.
  // Only the PT's call does this, and a day that already has a plan keeps it.
  async applyLastWeek(
    userId: number,
    body: ApplyLastWeekBody,
  ): Promise<CopyResult> {
    const weekStart = getWeekStart(body.weekStart);
    const lastWeek = getWeekDates(addDays(weekStart, -7));
    const thisWeek = getWeekDates(weekStart);

    // Everything is read inside the transaction; a day that got a plan in the
    // meantime is skipped, never overwritten.
    const outcome = await this.dataSource.transaction(async (manager) => {
      const sources = await this.store.listDaysInRange(
        manager,
        userId,
        lastWeek[0],
        lastWeek[lastWeek.length - 1],
      );
      const taken = new Set(
        (
          await this.store.listDaysInRange(
            manager,
            userId,
            thisWeek[0],
            thisWeek[thisWeek.length - 1],
          )
        ).map((day) => day.date),
      );
      const todo = sources.filter((day) => !taken.has(addDays(day.date, 7)));
      const plans = await this.store.loadPlans(
        manager,
        todo.map((day) => day.id),
      );
      let copied = 0;

      for (const day of todo) {
        const plan = plans.get(day.id);

        if (
          plan &&
          (await this.store.clonePlan(
            manager,
            plan,
            userId,
            addDays(day.date, 7),
          ))
        ) {
          copied += 1;
        }
      }
      return { sources: sources.length, copied };
    });

    if (outcome.sources === 0) {
      throw planErrors.noLastWeek();
    }
    return {
      copied: outcome.copied,
      skipped: outcome.sources - outcome.copied,
    };
  }
}
