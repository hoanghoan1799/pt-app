import { type AdminRole, toAdminRole } from "@pt/contracts";

// Pure role helpers (no database): safe for the auth guard and client code.
export type { AdminRole };
export { toAdminRole };

export const isSuperAdmin = (admin: { role: AdminRole }) =>
  admin.role === "super_admin";
