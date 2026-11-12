import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type BodyProfileBody,
  getTodayDate,
  type MyBodyProfileBody,
  type SaveBodyProfileResponse,
  type SaveWeightResponse,
} from "@pt/contracts";
import { DataSource, type EntityManager } from "typeorm";

import { Clock } from "../common/clock.js";
import { WeightLog } from "../database/entities/weight-log.entity.js";
import { toBodyProfileDetail, toTargetResponse } from "./mappers.js";
import { nutritionErrors } from "./nutrition.errors.js";
import { NutritionQueries } from "./nutrition.queries.js";
import { getBirthYear, getGoalFromAdjustment } from "./rules/energy.js";
import type { BodyProfileValues } from "./rules/types.js";
import { TargetsService,type TargetUpdate } from "./targets/targets.service.js";

type ProfileRow = {
  sex: BodyProfileValues["sex"];
  birth_year: number;
  height_cm: number;
  weight_kg: number;
  activity_level: BodyProfileValues["activityLevel"];
  goal: BodyProfileValues["goal"];
  kcal_adjustment: number | null;
  protein_per_kg: number | null;
};

const toValues = (row: ProfileRow): BodyProfileValues => ({
  sex: row.sex,
  birthYear: row.birth_year,
  heightCm: row.height_cm,
  weightKg: row.weight_kg,
  activityLevel: row.activity_level,
  goal: row.goal,
  kcalAdjustment: row.kcal_adjustment,
  proteinPerKg: row.protein_per_kg,
});

// The PT sets the energy model (the goal follows the kcal sign); a trainee's
// save leaves the stored energy model alone and only carries the legacy goal.
export type ProfileInput =
  | (Omit<BodyProfileBody, "applyToTarget"> & { kind: "admin" })
  | (MyBodyProfileBody & { kind: "user" });

@Injectable()
export class BodyProfileService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly targets: TargetsService,
    private readonly queries: NutritionQueries,
    private readonly clock: Clock,
  ) {}

  today() {
    return getTodayDate(undefined, this.clock.now());
  }

  // Admin: saves the measurements and, when ticked, replaces today's target
  // with the TDEE one.
  saveForAdmin(userId: number, body: BodyProfileBody) {
    const { applyToTarget, ...rest } = body;

    return this.save(
      userId,
      { ...rest, kind: "admin" },
      applyToTarget ? "always" : "never",
    );
  }

  // Trainee: the target follows the TDEE unless the PT set it by hand.
  saveForTrainee(userId: number, body: MyBodyProfileBody) {
    return this.save(userId, { ...body, kind: "user" }, "unless-manual");
  }

  private async upsertWeight(
    manager: EntityManager,
    userId: number,
    date: string,
    weightKg: number,
  ) {
    await manager
      .createQueryBuilder()
      .insert()
      .into(WeightLog)
      .values({ userId, date, weightKg })
      .orUpdate(["weight_kg"], ["user_id", "date"])
      .execute();
  }

  // Saves the profile (and today's weigh-in) and maybe today's target, in one
  // transaction.
  private async save(
    userId: number,
    input: ProfileInput,
    update: TargetUpdate,
  ): Promise<SaveBodyProfileResponse> {
    const today = this.today();
    const birthYear = getBirthYear(input.age, today);

    return this.dataSource.transaction(async (manager) => {
      const isAdmin = input.kind === "admin";
      const goal = isAdmin
        ? getGoalFromAdjustment(input.kcalAdjustment)
        : input.goal;
      const rows = await manager.query<ProfileRow[]>(
        `INSERT INTO body_profiles
           (user_id, sex, birth_year, height_cm, weight_kg, activity_level,
            goal, kcal_adjustment, protein_per_kg, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         ON CONFLICT (user_id) DO UPDATE SET
           sex = EXCLUDED.sex,
           birth_year = EXCLUDED.birth_year,
           height_cm = EXCLUDED.height_cm,
           weight_kg = EXCLUDED.weight_kg,
           activity_level = EXCLUDED.activity_level,
           ${
             isAdmin
               ? `goal = EXCLUDED.goal,
                  kcal_adjustment = EXCLUDED.kcal_adjustment,
                  protein_per_kg = EXCLUDED.protein_per_kg,`
               : // Keep the goal once the PT has set the energy model.
                 `goal = CASE WHEN body_profiles.kcal_adjustment IS NULL
                         THEN EXCLUDED.goal ELSE body_profiles.goal END,`
           }
           updated_at = now()
         RETURNING sex, birth_year, height_cm, weight_kg, activity_level, goal,
                   kcal_adjustment, protein_per_kg`,
        [
          userId,
          input.sex,
          birthYear,
          input.heightCm,
          input.weightKg,
          input.activityLevel,
          goal,
          isAdmin ? input.kcalAdjustment : null,
          isAdmin ? input.proteinPerKg : null,
        ],
      );
      const profile = toValues(rows[0]);

      await this.upsertWeight(manager, userId, today, profile.weightKg);

      const targetApplied = await this.targets.applyTdee(
        manager,
        userId,
        profile,
        update,
        today,
      );
      const target = await this.queries.latestTarget(userId, manager);

      return {
        bodyProfile: toBodyProfileDetail(profile, today),
        target: target ? toTargetResponse(target) : null,
        targetApplied,
      };
    });
  }

  // Records a weigh-in. When it is the most recent one, the body profile takes
  // the new weight and a TDEE-based target follows it (unless the PT set the
  // target by hand).
  async logWeight(
    userId: number,
    date: string,
    weightKg: number,
  ): Promise<SaveWeightResponse> {
    const today = this.today();

    if (date > today) {
      throw nutritionErrors.futureDate();
    }

    return this.dataSource.transaction(async (manager) => {
      await this.upsertWeight(manager, userId, date, weightKg);

      const newer = await manager.query<{ id: number }[]>(
        `SELECT id FROM weight_logs WHERE user_id = $1 AND date > $2 LIMIT 1`,
        [userId, date],
      );
      const profile = await this.queries.bodyProfile(userId, manager);
      let targetApplied = false;

      if (newer.length === 0 && profile) {
        await manager.query(
          `UPDATE body_profiles SET weight_kg = $2, updated_at = now()
            WHERE user_id = $1`,
          [userId, weightKg],
        );
        targetApplied = await this.targets.applyTdee(
          manager,
          userId,
          { ...profile, weightKg },
          "unless-manual",
          today,
        );
      }
      return { weightLog: { date, weightKg }, targetApplied };
    });
  }
}
