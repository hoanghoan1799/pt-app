"use server";

import { tryApi } from "@/services/api/call";
import { getAdminSession, getCurrentUser } from "@/services/auth-guard";
import { writeLocaleCookie } from "@/services/locale-cookie";
import { isLocale } from "@/utils/locale";

// Stores the language choice. No requireUser/requireAdmin on purpose: the login
// screens use it too, and a signed-out visitor just gets the cookie. The
// guards' non-throwing lookups (getCurrentUser / getAdminSession return null
// when signed out) decide whether to also save it on the account
// (PUT /v1/me/locale), so a new device picks it up at login. A locked admin
// may still pick a language. Unknown values are ignored instead of stored.
export const setLocaleAction = async (locale: string) => {
  if (!isLocale(locale)) {
    return;
  }
  await writeLocaleCookie(locale);

  const [user, admin] = await Promise.all([
    getCurrentUser(),
    getAdminSession(),
  ]);

  // A refused save (e.g. a locale the API does not know) keeps the cookie.
  if (user) {
    await tryApi("user", (api) =>
      api.PUT("/v1/me/locale", { body: { locale } }),
    );
  }
  if (admin) {
    await tryApi("admin", (api) =>
      api.PUT("/v1/me/locale", { body: { locale } }),
    );
  }
};
