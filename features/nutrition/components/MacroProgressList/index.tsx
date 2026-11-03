import { CaloriesProgressRow } from "@/features/nutrition/components/CaloriesProgressRow";
import { MacroProgressRow } from "@/features/nutrition/components/MacroProgressRow";
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

export const MacroProgressList = ({
  totals,
  kcal,
  target,
}: MacroProgressListProps) => (
  <ul className="space-y-4">
    <CaloriesProgressRow kcal={kcal} target={target} />
    {MACROS.map((macro) => (
      <MacroProgressRow
        key={macro}
        macro={macro}
        eaten={totals[macro]}
        target={target?.[macro]}
      />
    ))}
  </ul>
);
