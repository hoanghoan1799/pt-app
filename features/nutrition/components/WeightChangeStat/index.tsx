import { TrendingDown, TrendingUp } from "lucide-react";

import { formatWeightChange } from "@/features/nutrition/utils/weight";

interface WeightChangeStatProps {
  label: string;
  change: number | null;
}

// Direction is shown with an icon and a sign, never with color alone: losing
// weight isn't "good" for every goal.
export const WeightChangeStat = ({ label, change }: WeightChangeStatProps) => (
  <p className="px-2 py-3 text-center">
    <span className="flex items-center justify-center gap-1 text-lg font-bold text-fg tabular-nums">
      {change !== null &&
        change !== 0 &&
        (change < 0 ? (
          <TrendingDown className="size-4 text-muted" aria-hidden />
        ) : (
          <TrendingUp className="size-4 text-muted" aria-hidden />
        ))}
      {change === null ? "–" : formatWeightChange(change)}
    </span>
    <span className="text-xs text-muted">{label}</span>
  </p>
);
