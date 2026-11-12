import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { admins } from "@/db/schema";
import { PT_MESSAGES } from "@/features/pts/constants/messages";
import { isSuperAdmin } from "@/services/admin-scope";

export type ResolveTraineePtResult =
  | { status: "ok"; ptAdminId: number | null }
  | { status: "error"; message: string };

// Which PT a newly created trainee belongs to (W1). A PT always gets their own
// workspace, whatever the form says; a super admin may leave it empty or pick
// an existing PT account.
export const resolveTraineePt = async (
  admin: { id: number; role: "super_admin" | "pt" },
  rawPtId: string,
): Promise<ResolveTraineePtResult> => {
  if (!isSuperAdmin(admin)) {
    return { status: "ok", ptAdminId: admin.id };
  }

  const trimmed = rawPtId.trim();

  if (trimmed === "") {
    return { status: "ok", ptAdminId: null };
  }

  const ptAdminId = Number(trimmed);

  if (!Number.isInteger(ptAdminId) || ptAdminId <= 0) {
    return { status: "error", message: PT_MESSAGES.PT_NOT_FOUND };
  }

  const [pt] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(and(eq(admins.id, ptAdminId), eq(admins.role, "pt")))
    .limit(1);

  return pt
    ? { status: "ok", ptAdminId }
    : { status: "error", message: PT_MESSAGES.PT_NOT_FOUND };
};
