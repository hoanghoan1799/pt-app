export const LOCALE_COOKIE = "locale";

export const LOCALES = ["vi", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "vi";

// Each language is shown in its own language, so these are never translated.
export const LOCALE_NAMES: Record<Locale, string> = {
  vi: "Tiếng Việt",
  en: "English",
};

// One year: a language is a stable personal choice, not a session.
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

// Reads a raw cookie value (or form input). Anything that is not exactly one of
// the known locales, including a missing cookie, becomes the default.
export const parseLocale = (value: unknown): Locale =>
  isLocale(value) ? value : DEFAULT_LOCALE;

export const getLocaleCookieOptions = () => ({
  maxAge: LOCALE_MAX_AGE,
  path: "/",
  sameSite: "lax" as const,
  // Read by the server only; the client changes it through setLocaleAction.
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
});
