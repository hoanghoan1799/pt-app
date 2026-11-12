import { getLocale } from "next-intl/server";

import { localizeMessageFor, localizeResultFor } from "@/i18n/localize-message";
import { getTranslator } from "@/i18n/translator";
import { DEFAULT_LOCALE, type Locale, parseLocale } from "@/utils/locale";

// The request's locale (the `locale` cookie). Outside a request (tests,
// scripts) there is none, so it falls back to the default instead of failing.
export const getActiveLocale = async (): Promise<Locale> => {
  try {
    return parseLocale(await getLocale());
  } catch {
    return DEFAULT_LOCALE;
  }
};

// Server messages are written in Vietnamese; this returns the active locale's
// text for a known one and the input unchanged for anything else.
export const localizeMessage = async (text: string) =>
  localizeMessageFor(await getActiveLocale(), text);

// Same for an action result: its `message` and `fieldErrors` are localized.
export const localizeResult = async <T>(result: T): Promise<T> =>
  localizeResultFor(await getActiveLocale(), result);

// For messages with values that are themselves locale-dependent (a week
// range, a name): `t("toasts.memberAdded", { name })`.
export const getErrorsTranslator = async () =>
  getTranslator(await getActiveLocale(), "errors");
