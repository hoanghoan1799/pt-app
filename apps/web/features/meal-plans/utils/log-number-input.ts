import { parseDecimal } from "@pt/contracts";

import { formatGrams } from "@/features/foods/utils/food-math";

// An optional number typed in the log form: empty is "not given" (null), a
// number from 0 to `max` is kept as typed, anything else is "invalid".
export const parseOptionalNumber = (
  text: string,
  max: number,
): number | null | "invalid" => {
  if (!text.trim()) {
    return null;
  }

  const value = parseDecimal(text);

  return Number.isFinite(value) && value >= 0 && value <= max
    ? value
    : "invalid";
};

// Back into a field: 7.2 -> "7,2", null -> "".
export const toFieldText = (value: number | null) =>
  value === null ? "" : formatGrams(value);
