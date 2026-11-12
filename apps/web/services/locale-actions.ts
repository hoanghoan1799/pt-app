"use server";

import { setAdminLocale } from "@/services/admins";
import { getAdminSession, getCurrentUser } from "@/services/auth-guard";
import { writeLocaleCookie } from "@/services/locale-cookie";
import { setUserLocale } from "@/services/users";
import { isLocale } from "@/utils/locale";

// Stores the language choice. No requireUser/requireAdmin on purpose: the login
// screens use it too, and a signed-out visitor just gets the cookie. The
// guards' non-throwing lookups (getCurrentUser / getAdminSession return null
// when signed out) decide whether to also save it on the account, so a new
// device picks it up at login. Unknown values are ignored instead of stored.
export const setLocaleAction = async (locale: string) => {
  if (!isLocale(locale)) {
    return;
  }
  await writeLocaleCookie(locale);

  const [user, admin] = await Promise.all([
    getCurrentUser(),
    getAdminSession(),
  ]);

  if (user) {
    await setUserLocale(user.id, locale);
  }
  if (admin) {
    await setAdminLocale(admin.id, locale);
  }
};
