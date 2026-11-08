import "server-only";

import { asc, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { admins, users } from "@/db/schema";
import { toAdminRole } from "@/services/admin-scope";

export interface AdminAccount {
  id: number;
  username: string;
  role: "super_admin" | "pt";
  verified: boolean;
  // Trainees in this account's workspace (users.pt_admin_id).
  traineeCount: number;
}

// Every admin account (super admins and PTs) for the "Quản lý PT" page.
export const listAdminAccounts = async (): Promise<AdminAccount[]> => {
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: admins.id,
        username: admins.username,
        role: admins.role,
        verifiedAt: admins.verifiedAt,
      })
      .from(admins)
      .orderBy(asc(admins.id)),
    db
      .select({ ptAdminId: users.ptAdminId, total: count(users.id) })
      .from(users)
      .groupBy(users.ptAdminId),
  ]);
  const countByPt = new Map(counts.map((row) => [row.ptAdminId, row.total]));

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    role: toAdminRole(row.role),
    verified: row.verifiedAt !== null,
    traineeCount: countByPt.get(row.id) ?? 0,
  }));
};

export interface WorkspaceTrainee {
  id: number;
  name: string;
  ptAdminId: number | null;
}

// Every trainee with their PT, for the move-between-PTs lists.
export const listWorkspaceTrainees = async (): Promise<WorkspaceTrainee[]> =>
  db
    .select({ id: users.id, name: users.name, ptAdminId: users.ptAdminId })
    .from(users)
    .orderBy(asc(users.nameKey));

export const listPtOptions = async () => {
  const rows = await db
    .select({ id: admins.id, username: admins.username })
    .from(admins)
    .where(eq(admins.role, "pt"))
    .orderBy(asc(admins.username));

  return rows;
};
