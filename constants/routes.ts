export const ROUTES = {
  HOME: "/",
  WORKOUTS: "/workouts",
  NUTRITION: "/nutrition",
  SUMMARY: "/summary",
  MESSAGES: "/messages",
  FOODS: "/foods",
  ACCOUNT_PASSWORD: "/account/password",
  // Static fallback the service worker shows when the network is down.
  OFFLINE: "/offline",
  ADMIN: "/admin",
  ADMIN_LOGIN: "/admin/login",
  // Passcode screen shown while an admin with a passcode is locked (KAN-160).
  ADMIN_LOCK: "/admin/lock",
  ADMIN_MANIFEST: "/admin-manifest.webmanifest",
  ADMIN_USERS: "/admin/users",
  ADMIN_MESSAGES: "/admin/messages",
  ADMIN_PTS: "/admin/pts",
  ADMIN_FOODS: "/admin/foods",
  ADMIN_FOODS_NEW: "/admin/foods/new",
  // Route handler that clears a stale session cookie, see app/session/end.
  SESSION_END: "/session/end",
} as const;

export const ADMIN_PREVIEW_SEGMENT = "preview";
export const ADMIN_NUTRITION_SEGMENT = "nutrition";
export const ADMIN_SUMMARY_SEGMENT = "summary";
export const ADMIN_MESSAGES_SEGMENT = "messages";
export const SESSION_ROLE_PARAM = "role";
