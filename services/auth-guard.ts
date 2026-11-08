import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { ROUTES, SESSION_ROLE_PARAM } from "@/constants/routes";
import { ADMIN_COOKIE, USER_COOKIE } from "@/constants/session";
import { isAdminLocked } from "@/services/admin-lock";
import { findAdminById } from "@/services/admins";
import { readSession } from "@/services/session";
import { findUserById } from "@/services/users";
import type { SessionRole } from "@/types/session";
import { isSessionStale, sessionAuthTime } from "@/utils/session-staleness";

// Cached per request: the guard layout and the page both ask for it.
export const getCurrentUser = cache(async () => {
  const session = await readSession(USER_COOKIE);

  if (session?.role !== "user") {
    return null;
  }
  // The user may have been deleted by the admin since the cookie was issued.
  const user = await findUserById(session.userId);

  // A reset or password change signs out sessions issued before it.
  if (
    !user ||
    isSessionStale(sessionAuthTime(session), user.passwordChangedAt)
  ) {
    return null;
  }
  return user;
});

// The signed-in admin, ignoring the passcode lock (KAN-160). Only the lock
// page and the passcode actions should use this, through requireAdminSession;
// everything else goes through getApiAdmin / requireAdmin so a locked admin
// gets nothing.
export const getAdminSession = cache(async () => {
  const session = await readSession(ADMIN_COOKIE);

  if (session?.role !== "admin") {
    return null;
  }
  return findAdminById(session.adminId);
});

// Signed in and unlocked. Null for a missing session and for a locked admin.
export const getCurrentAdmin = cache(async () => {
  const admin = await getAdminSession();

  return admin && !(await isAdminLocked(admin)) ? admin : null;
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

// Signed in, passcode lock ignored: the lock page and passcode actions.
export const requireAdminSession = async () => {
  const admin = await getAdminSession();

  return admin ?? endSessionAndRedirect("admin");
};

// A locked admin is sent to the passcode screen, not signed out.
export const requireAdmin = async () => {
  const admin = await requireAdminSession();

  return (await isAdminLocked(admin)) ? redirect(ROUTES.ADMIN_LOCK) : admin;
};

// Route handlers answer 401 JSON instead of redirecting to a login page, so
// these return null for a missing/stale session or a locked admin (KAN-160). Same checks as the
// require* guards above (deleted user, password changed since sign-in).
export const getApiUser = getCurrentUser;
export const getApiAdmin = getCurrentAdmin;
