import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { admins } from "@/db/schema";
import { toAdminRole } from "@/services/admin-scope";

export interface AdminAccount {
  id: number;
  username: string;
  role: "super_admin" | "pt";
  verified: boolean;
}

// Every admin account (super admins and PTs) for the "Quản lý PT" page.
export const listAdminAccounts = async (): Promise<AdminAccount[]> => {
  const rows = await db
    .select({
      id: admins.id,
      username: admins.username,
      role: admins.role,
      verifiedAt: admins.verifiedAt,
    })
    .from(admins)
    .orderBy(asc(admins.id));

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    role: toAdminRole(row.role),
    verified: row.verifiedAt !== null,
  }));
};

export const listPtOptions = async () => {
  const rows = await db
    .select({ id: admins.id, username: admins.username })
    .from(admins)
    .where(eq(admins.role, "pt"))
    .orderBy(asc(admins.username));

  return rows;
};
