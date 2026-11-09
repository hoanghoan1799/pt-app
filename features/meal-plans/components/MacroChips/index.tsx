import clsx from "clsx";
import { useLocale, useTranslations } from "next-intl";

import {
  MACRO_COLORS,
  MACRO_LABELS,
  MACROS,
} from "@/features/nutrition/constants/nutrition";
import type { MacroAmounts } from "@/features/nutrition/types/nutrition";
import { type Locale, toIntlLocale } from "@/utils/locale";

interface MacroChipsProps {
  totals: MacroAmounts;
  // Shown after a slash when the meal or day has a target.
  target?: MacroAmounts | null;
}

const round = (value: number) => Math.round(value * 10) / 10;

const format = (value: number, locale: Locale) =>
  round(value).toLocaleString(toIntlLocale(locale), {
    maximumFractionDigits: 1,
  });

export const MacroChips = ({ totals, target }: MacroChipsProps) => {
  const locale = useLocale();
  const tLabels = useTranslations("nutrition.labels");

  return (
    <ul className="grid grid-cols-3 gap-2">
      {MACROS.map((macro) => (
        <li
          key={macro}
          className={clsx(
            "min-w-0 rounded-xl px-2 py-2",
            MACRO_COLORS[macro].soft,
          )}
        >
          <p
            className={clsx(
              "text-xs font-semibold whitespace-nowrap",
              MACRO_COLORS[macro].text,
            )}
          >
            {tLabels(MACRO_LABELS[macro].nameKey)} (g)
          </p>
          <p className="text-sm leading-tight font-bold text-fg tabular-nums">
            {format(totals[macro], locale)}
            {target ? (
              <span className="block text-xs font-normal text-muted">
                {/* The space keeps "70 / 70,1" readable as text when the
                  block layout is not applied (screen readers, copy). */}
                <span className="sr-only"> </span>/{" "}
                {format(target[macro], locale)}
              </span>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
};
