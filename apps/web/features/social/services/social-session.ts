import "server-only";

import { requireAdmin, requireUser } from "@/services/auth-guard";

export type Who = "user" | "admin";

// Every social action starts here: a signed-in trainee or an unlocked admin
// (the guards redirect otherwise). The terms are the API's to enforce: it
// answers 403 TERMS_REQUIRED, which the action shows as is.
export const requireWho = async (who: Who): Promise<Who> => {
  if (who === "admin") {
    await requireAdmin();
    return "admin";
  }
  await requireUser();
  return "user";
};
