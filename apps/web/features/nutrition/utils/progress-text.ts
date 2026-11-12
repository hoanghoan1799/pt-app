import type { MacroComparison } from "@/features/nutrition/types/nutrition";
import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale, toIntlLocale } from "@/utils/locale";

// "còn 50 g", "vượt 20 kcal", "đạt ✓" or "" when there is no target.
// English: "50 g left", "20 kcal over", "on target ✓".
export const formatComparison = (
  { status, difference }: MacroComparison,
  unit: string,
  locale: Locale = DEFAULT_LOCALE,
) => {
  const t = getFormatTranslator(locale);
  const amount = () =>
    Math.round(difference).toLocaleString(toIntlLocale(locale));

  if (status === "under") {
    return t("comparison.under", { amount: amount(), unit });
  }
  if (status === "over") {
    return t("comparison.over", { amount: amount(), unit });
  }
  return status === "on" ? t("comparison.on") : "";
};
