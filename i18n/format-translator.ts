import { createTranslator } from "next-intl";

import enFormat from "@/messages/en/format.json";
import viFormat from "@/messages/vi/format.json";
import type { Locale } from "@/utils/locale";

// The shared formatters (dates, numbers, short labels) run in client bundles
// too, so they load only the small `format` namespace, not every message file.
const FORMAT_MESSAGES = { vi: viFormat, en: enFormat } as const;

export const getFormatTranslator = (locale: Locale) =>
  createTranslator({
    locale,
    messages: { format: FORMAT_MESSAGES[locale] as typeof viFormat },
    namespace: "format",
    timeZone: "Asia/Ho_Chi_Minh",
  });
