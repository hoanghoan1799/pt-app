import "server-only";

import { notFound } from "next/navigation";

import { getTrainee } from "@/features/members/services/member-queries";
import { requireAdmin } from "@/services/auth-guard";

// Signed-in, unlocked admin who may work with this trainee: a PT only for the
// trainees of their workspace, a super admin for all; a trainee the admin hid
// counts as missing until revealed. Anyone else gets notFound(), same as the
// admin pages. The API decides (GET /v1/trainees/{id} answers 404 for out of
// workspace, hidden and missing alike), so this cannot drift from its rules.
export const requireAdminForUser = async (userId: number) => {
  const admin = await requireAdmin();

  return (await getTrainee(userId)) ? admin : notFound();
};
