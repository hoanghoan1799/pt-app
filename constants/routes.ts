export const ROUTES = {
  HOME: "/",
  WORKOUTS: "/workouts",
  ADMIN: "/admin",
  ADMIN_LOGIN: "/admin/login",
  ADMIN_USERS: "/admin/users",
  // Route handler that clears a stale session cookie, see app/session/end.
  SESSION_END: "/session/end",
} as const;

export const ADMIN_PREVIEW_SEGMENT = "preview";
export const SESSION_ROLE_PARAM = "role";
