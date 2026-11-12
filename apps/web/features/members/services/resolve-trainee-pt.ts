import { PT_MESSAGES } from "@/features/pts/constants/messages";
import { isSuperAdmin } from "@/utils/admin-role";

export type ResolveTraineePtResult =
  | { status: "ok"; ptAdminId: number | null }
  | { status: "error"; message: string };

// Which PT a newly created trainee belongs to (W1). A PT always gets their own
// workspace, whatever the form says; a super admin may leave it empty or pick
// a PT account. Only the shape is checked here: the API (POST /v1/trainees)
// answers PT_NOT_FOUND for an id that is not a PT account.
export const resolveTraineePt = (
  admin: { id: number; role: "super_admin" | "pt" },
  rawPtId: string,
): ResolveTraineePtResult => {
  if (!isSuperAdmin(admin)) {
    return { status: "ok", ptAdminId: admin.id };
  }

  const trimmed = rawPtId.trim();

  if (trimmed === "") {
    return { status: "ok", ptAdminId: null };
  }

  const ptAdminId = Number(trimmed);

  return Number.isInteger(ptAdminId) && ptAdminId > 0
    ? { status: "ok", ptAdminId }
    : { status: "error", message: PT_MESSAGES.PT_NOT_FOUND };
};
