import enCommon from "@/messages/en/common.json";
import enLayout from "@/messages/en/layout.json";
import viCommon from "@/messages/vi/common.json";
import viLayout from "@/messages/vi/layout.json";
import type { Locale } from "@/utils/locale";

// One object per locale, keyed by namespace. Files are imported statically (no
// dynamic fs) so they bundle on every runtime. Add a namespace here and in
// both messages/<locale>/ folders; i18n/__tests__/messages.test.ts checks them.
export const MESSAGES = {
  vi: { common: viCommon, layout: viLayout },
  en: { common: enCommon, layout: enLayout },
} as const satisfies Record<Locale, Record<string, object>>;

export const viMessages = MESSAGES.vi;

export const getMessages = (locale: Locale) => MESSAGES[locale];
