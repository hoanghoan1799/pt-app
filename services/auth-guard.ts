import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { ROUTES, SESSION_ROLE_PARAM } from "@/constants/routes";
import { ADMIN_COOKIE, USER_COOKIE } from "@/constants/session";
import { findAdminById } from "@/services/admins";
import { readSession } from "@/services/session";
import { findUserById } from "@/services/users";
import type { SessionRole } from "@/types/session";

// Cached per request: the guard layout and the page both ask for it.
export const getCurrentUser = cache(async () => {
  const session = await readSession(USER_COOKIE);

  if (session?.role !== "user") {
    return null;
  }
  // The user may have been deleted by the admin since the cookie was issued.
  return findUserById(session.userId);
});

export const getCurrentAdmin = cache(async () => {
  const session = await readSession(ADMIN_COOKIE);

  if (session?.role !== "admin") {
    return null;
  }
  return findAdminById(session.adminId);
});

// Server components can't delete cookies, so a missing/stale session goes
// through a route handler that clears the cookie before showing the login
// page — otherwise the proxy would keep bouncing a stale cookie around.
const endSessionAndRedirect = (role: SessionRole): never =>
  redirect(`${ROUTES.SESSION_END}?${SESSION_ROLE_PARAM}=${role}`);

export const requireUser = async () => {
  const user = await getCurrentUser();

  return user ?? endSessionAndRedirect("user");
};

export const requireAdmin = async () => {
  const admin = await getCurrentAdmin();

  return admin ?? endSessionAndRedirect("admin");
};
