import { CaloriesProgressRow } from "@/features/nutrition/components/CaloriesProgressRow";
import { MacroProgressRow } from "@/features/nutrition/components/MacroProgressRow";
import { MACROS } from "@/features/nutrition/constants/nutrition";
import type {
  MacroAmounts,
  NutritionTarget,
} from "@/features/nutrition/types/nutrition";

interface MacroProgressListProps {
  totals: MacroAmounts;
  target: NutritionTarget | null;
}

export const MacroProgressList = ({
  totals,
  target,
}: MacroProgressListProps) => (
  <ul className="space-y-4">
    <CaloriesProgressRow totals={totals} target={target} />
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
