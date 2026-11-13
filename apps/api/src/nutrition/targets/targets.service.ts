import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";

import { NutritionTarget } from "../../database/entities/nutrition-target.entity.js";
import { NutritionQueries } from "../nutrition.queries.js";
import type {
  BodyProfileValues,
  MacroAmounts,
  TargetRow,
} from "../rules/types.js";
import { TargetCalculator } from "./target-strategy.js";

// When a body profile save or a weigh-in may replace today's target:
// "always": the admin asked for it; "never"; "unless-manual": a user edit or
// weigh-in, which must not replace a target the admin typed by hand.
export type TargetUpdate = "always" | "never" | "unless-manual";

// Writes the `nutrition_targets` rows. The macros come from a
// NutritionTargetStrategy chosen by source (manual vs TDEE).
@Injectable()
export class TargetsService {
  constructor(
    private readonly calculator: TargetCalculator,
    private readonly queries: NutritionQueries,
  ) {}

  // Admin: sets the daily target from today on; earlier days keep theirs.
  async saveManual(
    manager: EntityManager,
    userId: number,
    input: MacroAmounts & { note: string },
    today: string,
  ): Promise<TargetRow> {
    const macros = this.calculator.compute("manual", input);

    await manager
      .createQueryBuilder()
      .insert()
      .into(NutritionTarget)
      .values({
        userId,
        effectiveFrom: today,
        ...macros,
        note: input.note,
        source: "manual",
      })
      .orUpdate(
        ["carbs", "protein", "fat", "note", "source"],
        ["user_id", "effective_from"],
      )
      .execute();

    return {
      effectiveFrom: today,
      ...macros,
      note: input.note,
      source: "manual",
    };
  }

  // Replaces today's target with the TDEE macros when allowed; returns whether
  // it did. The coach note of the latest target is kept.
  async applyTdee(
    manager: EntityManager,
    userId: number,
    profile: BodyProfileValues,
    update: TargetUpdate,
    today: string,
  ): Promise<boolean> {
    const latest = await this.queries.latestTarget(userId, manager);
    const shouldUpdate =
      update === "always" ||
      (update === "unless-manual" && latest?.source !== "manual");

    if (!shouldUpdate) {
      return false;
    }

    const macros = this.calculator.compute("tdee", { profile, today });

    await manager
      .createQueryBuilder()
      .insert()
      .into(NutritionTarget)
      .values({
        userId,
        effectiveFrom: today,
        ...macros,
        note: latest?.note ?? "",
        source: "tdee",
      })
      .orUpdate(
        ["carbs", "protein", "fat", "source"],
        ["user_id", "effective_from"],
      )
      .execute();
    return true;
  }
}
