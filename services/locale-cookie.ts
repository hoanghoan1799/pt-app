import "server-only";

import { cookies } from "next/headers";

import {
  getLocaleCookieOptions,
  isLocale,
  type Locale,
  LOCALE_COOKIE,
} from "@/utils/locale";

export const writeLocaleCookie = async (locale: Locale) => {
  const cookieStore = await cookies();

  cookieStore.set(LOCALE_COOKIE, locale, getLocaleCookieOptions());
};

// After login: a language saved on the account wins over this device's cookie.
// Nothing stored (or an unknown value) leaves the cookie as it is.
export const applyStoredLocale = async (stored: string | null | undefined) => {
  if (isLocale(stored)) {
    await writeLocaleCookie(stored);
  }
};
