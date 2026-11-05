"use server";

import { cookies } from "next/headers";

import { getThemeCookieOptions, isTheme, THEME_COOKIE } from "@/utils/theme";

// Stores the theme choice. No auth guard on purpose: it only writes a display
// preference cookie for whoever is asking, never touches data. Unknown values
// are ignored instead of stored.
export const setThemeAction = async (theme: string) => {
  if (!isTheme(theme)) {
    return;
  }
  const cookieStore = await cookies();

  cookieStore.set(THEME_COOKIE, theme, getThemeCookieOptions());
};
