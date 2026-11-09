import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

// Client-side validation messages for the set rows (utils/set-logger.ts,
// tested). The wrapped schema message stays Vietnamese (server messages).
export const describeMissingReps = (
  setNumber: number,
  locale: Locale = DEFAULT_LOCALE,
) => getFormatTranslator(locale)("setRow.missingReps", { number: setNumber });

export const describeRowError = (
  setNumber: number,
  message: string,
  locale: Locale = DEFAULT_LOCALE,
) =>
  getFormatTranslator(locale)("setRow.error", { number: setNumber, message });
