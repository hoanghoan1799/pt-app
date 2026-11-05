export const THEME_COOKIE = "theme";

export const THEMES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEMES)[number];

// "Hệ thống" follows prefers-color-scheme, so it is also the safe fallback.
export const DEFAULT_THEME: Theme = "system";

// One year: a theme is a stable personal choice, not a session.
export const THEME_MAX_AGE = 60 * 60 * 24 * 365;

export const isTheme = (value: unknown): value is Theme =>
  typeof value === "string" && (THEMES as readonly string[]).includes(value);

// Reads a raw cookie value (or form input). Anything that is not exactly one of
// the three known values, including a missing cookie, becomes the default.
export const parseTheme = (value: unknown): Theme =>
  isTheme(value) ? value : DEFAULT_THEME;

export const getThemeCookieOptions = () => ({
  maxAge: THEME_MAX_AGE,
  path: "/",
  sameSite: "lax" as const,
  // Read by the server only; the client sets the attribute itself.
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
});
