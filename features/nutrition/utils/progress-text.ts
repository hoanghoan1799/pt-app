import type { MacroComparison } from "@/features/nutrition/types/nutrition";

// "còn 50 g", "vượt 20 kcal", "đạt ✓" or "" when there is no target.
export const formatComparison = (
  { status, difference }: MacroComparison,
  unit: string,
) => {
  if (status === "under") {
    return `còn ${Math.round(difference).toLocaleString("vi-VN")} ${unit}`;
  }
  if (status === "over") {
    return `vượt ${Math.round(difference).toLocaleString("vi-VN")} ${unit}`;
  }
  return status === "on" ? "đạt ✓" : "";
};
