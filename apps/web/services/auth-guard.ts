import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { ROUTES, SESSION_ROLE_PARAM } from "@/constants/routes";
import { fetchMe } from "@/services/api/me";
import type { SessionRole } from "@/types/session";
import { isSuperAdmin } from "@/utils/admin-role";

// The signed-in actor comes from the API (GET /v1/auth/me) with the session
// cookie's token, once per request. Session lifetime, password changes, admin
// deletion and the passcode lock are all decided by the API.

// Cached per request: the guard layout and the page both ask for it.
export const getCurrentUser = cache(async () => {
  const me = await fetchMe("user");

  if (me?.actor.kind !== "user") {
    return null;
  }

  const { actor } = me;

  return {
    id: actor.id,
    name: actor.name,
    email: actor.email,
    locale: actor.locale,
    ptAdminId: actor.ptAdminId,
    // Chat permission, accepted social terms version and the meal plan request
    // all come with GET /v1/auth/me.
    chatEnabled: actor.chatEnabled,
    termsVersion: actor.termsVersion,
    preferredMealCount: actor.preferredMealCount,
    foodNote: actor.foodNote,
  };
});

// The signed-in admin, ignoring the passcode lock (KAN-160). Only the lock
// page and the passcode actions should use this, through requireAdminSession;
// everything else goes through getApiAdmin / requireAdmin so a locked admin
// gets nothing.
export const getAdminSession = cache(async () => {
  const me = await fetchMe("admin");

  if (me?.actor.kind !== "admin") {
    return null;
  }

  const { actor } = me;

  return {
    id: actor.id,
    username: actor.username,
    role: actor.role,
    locale: actor.locale,
    presenceHidden: actor.presenceHidden,
    hasPasscode: actor.hasPasscode,
    verified: actor.verified,
    // True while the admin has a passcode and no valid unlock on this session.
    locked: actor.locked,
    unlockedUntil: actor.unlockedUntil,
    revealedUntil: actor.revealedUntil,
  };
});

// Signed in and unlocked. Null for a missing session and for a locked admin.
export const getCurrentAdmin = cache(async () => {
  const admin = await getAdminSession();

  return admin && !admin.locked ? admin : null;
});

// Super admin only (P1): a PT is sent back to the admin dashboard.
export const requireSuperAdmin = async () => {
  const admin = await requireAdmin();

  return isSuperAdmin(admin) ? admin : redirect(ROUTES.ADMIN);
};

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

  return admin.locked ? redirect(ROUTES.ADMIN_LOCK) : admin;
};

// Route handlers answer 401 JSON instead of redirecting to a login page, so
// these return null for a missing/stale session or a locked admin (KAN-160).
// Same checks as the require* guards above.
export const getApiUser = getCurrentUser;
export const getApiAdmin = getCurrentAdmin;
