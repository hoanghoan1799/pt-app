import { Injectable } from "@nestjs/common";

import { calculateEnergyPlan } from "../rules/energy.js";
import type {
  BodyProfileValues,
  MacroAmounts,
  TargetSource,
} from "../rules/types.js";

// What each strategy needs to produce the day's macros.
export type TargetInputs = {
  // The PT typed the numbers.
  manual: MacroAmounts;
  // Worked out from the body profile (Mifflin-St Jeor TDEE + the PT's model).
  tdee: { profile: BodyProfileValues; today: string };
};

// One way of deciding the daily macro target. `nutrition_targets.source` says
// which one produced a stored row.
export interface NutritionTargetStrategy<
  S extends TargetSource = TargetSource,
> {
  readonly source: S;
  compute(input: TargetInputs[S]): MacroAmounts;
}

export const NUTRITION_TARGET_STRATEGIES = Symbol(
  "NUTRITION_TARGET_STRATEGIES",
);

@Injectable()
export class ManualTarget implements NutritionTargetStrategy<"manual"> {
  readonly source = "manual" as const;

  compute({ carbs, protein, fat }: TargetInputs["manual"]): MacroAmounts {
    return { carbs, protein, fat };
  }
}

@Injectable()
export class TdeeTarget implements NutritionTargetStrategy<"tdee"> {
  readonly source = "tdee" as const;

  compute({ profile, today }: TargetInputs["tdee"]): MacroAmounts {
    return calculateEnergyPlan(profile, today).macros;
  }
}

// The context: picks the strategy by source. A new source (another formula) is
// one more class registered in the module, nothing else changes.
export class TargetCalculator {
  private readonly bySource: Map<TargetSource, NutritionTargetStrategy>;

  constructor(strategies: NutritionTargetStrategy[]) {
    this.bySource = new Map(
      strategies.map((strategy) => [strategy.source, strategy]),
    );
  }

  compute<S extends TargetSource>(
    source: S,
    input: TargetInputs[S],
  ): MacroAmounts {
    const strategy = this.bySource.get(source) as
      NutritionTargetStrategy<S> | undefined;

    if (!strategy) {
      throw new Error(`No nutrition target strategy for "${source}"`);
    }
    return strategy.compute(input);
  }
}
