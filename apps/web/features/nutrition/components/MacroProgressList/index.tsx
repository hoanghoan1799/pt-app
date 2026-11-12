import { CaloriesProgressRow } from "@/features/nutrition/components/CaloriesProgressRow";
import { MacroRing } from "@/features/nutrition/components/MacroRing";
import { MACROS } from "@/features/nutrition/constants/nutrition";
import type {
  MacroAmounts,
  NutritionTarget,
} from "@/features/nutrition/types/nutrition";

interface MacroProgressListProps {
  totals: MacroAmounts;
  // Counted kcal; a free food can add kcal without macros.
  kcal: number;
  target: NutritionTarget | null;
}

// Calories as one line, then the three macros as rings in a row.
export const MacroProgressList = ({
  totals,
  kcal,
  target,
}: MacroProgressListProps) => (
  <div className="space-y-4">
    <ul>
      <CaloriesProgressRow kcal={kcal} target={target} />
    </ul>
    <ul className="flex items-start justify-between gap-2">
      {MACROS.map((macro) => (
        <MacroRing
          key={macro}
          macro={macro}
          eaten={totals[macro]}
          target={target?.[macro]}
        />
      ))}
    </ul>
  </div>
);
