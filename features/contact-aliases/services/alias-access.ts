import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { admins, users } from "@/db/schema";
import {
  parseActorRef,
  PT_ALIAS_TARGET,
} from "@/features/contact-aliases/utils/alias-rules";
import { isBlockedBetween } from "@/features/social/services/relationships";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { canAdminAccessUser } from "@/services/hidden-users";

// May this owner give this target a nickname, i.e. does the target exist and
// can the owner see them? A deleted account is simply "no"; the caller answers
// with its own "not found". `targetKey` has already passed checkAliasTarget.
//   trainee owner: their PT side ("pt"), any PT, or a trainee in the social
//   network (accepted the terms, not blocked either way).
//   admin owner: a trainee in their scope and not hidden from them, or a PT.
export const canSeeAliasTarget = async (
  owner: { kind: "user" | "admin"; id: number },
  targetKey: string,
): Promise<boolean> => {
  if (targetKey === PT_ALIAS_TARGET) {
    return owner.kind === "user";
  }
  const target = parseActorRef(targetKey);

  if (!target) {
    return false;
  }
  if (target.kind === "admin") {
    const [row] = await db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.id, target.id))
      .limit(1);

    return Boolean(row);
  }
  if (owner.kind === "admin") {
    return canAdminAccessUser(owner.id, target.id);
  }
  const [row] = await db
    .select({ id: users.id, termsVersion: users.termsVersion })
    .from(users)
    .where(eq(users.id, target.id))
    .limit(1);

  return (
    Boolean(row) &&
    hasAcceptedTerms(row) &&
    !(await isBlockedBetween(owner.id, target.id))
  );
};
