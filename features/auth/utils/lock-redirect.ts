import { ROUTES } from "@/constants/routes";

// The page to open after unlocking. Only same-site /admin paths are allowed:
// anything else (other origins, protocol-relative, the lock page itself, odd
// characters) falls back to the dashboard.
export const safeNextPath = (value: string | undefined | null) => {
  if (!value || !/^\/admin(?:[/?#]|$)/.test(value)) {
    return ROUTES.ADMIN;
  }
  if (/[\\\u0000-\u001f]/.test(value) || value.includes("//")) {
    return ROUTES.ADMIN;
  }
  if (
    value === ROUTES.ADMIN_LOCK ||
    value.startsWith(`${ROUTES.ADMIN_LOCK}/`) ||
    value.startsWith(`${ROUTES.ADMIN_LOCK}?`) ||
    value.startsWith(ROUTES.ADMIN_LOGIN)
  ) {
    return ROUTES.ADMIN;
  }
  return value;
};

export const buildLockUrl = (currentPath: string) =>
  `${ROUTES.ADMIN_LOCK}?next=${encodeURIComponent(safeNextPath(currentPath))}`;
