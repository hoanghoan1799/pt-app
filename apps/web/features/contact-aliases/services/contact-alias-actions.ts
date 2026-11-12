"use server";

import { revalidatePath } from "next/cache";

import { ALIAS_MESSAGES } from "@/features/contact-aliases/constants/messages";
import { canSeeAliasTarget } from "@/features/contact-aliases/services/alias-access";
import { setAlias } from "@/features/contact-aliases/services/contact-aliases";
import type { SetAliasResult } from "@/features/contact-aliases/types/contact-aliases";
import {
  adminActorKey,
  checkAliasTarget,
  setAliasInputSchema,
  userActorKey,
} from "@/features/contact-aliases/utils/alias-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdmin, requireUser } from "@/services/auth-guard";

// Private nicknames. The owner is always the signed-in account; the input only
// names the target. Only the owner's own pages are refreshed: nobody else is
// told, because nobody else's view changes.

const fail = (message: string): SetAliasResult => ({
  status: "error",
  message,
});

const save = async (
  owner: { kind: "user" | "admin"; id: number },
  ownerKey: string,
  input: unknown,
): Promise<SetAliasResult> => {
  const parsed = setAliasInputSchema.safeParse(input);

  if (!parsed.success) {
    return fail(ALIAS_MESSAGES.INVALID);
  }
  const { targetKey, alias } = parsed.data;
  const check = checkAliasTarget(ownerKey, targetKey);

  if (check === "self") {
    return fail(ALIAS_MESSAGES.SELF);
  }
  if (check !== "ok") {
    return fail(ALIAS_MESSAGES.TARGET_NOT_FOUND);
  }
  // Clearing an alias of an account that is gone must still work.
  if (alias !== "" && !(await canSeeAliasTarget(owner, targetKey))) {
    return fail(ALIAS_MESSAGES.TARGET_NOT_FOUND);
  }
  if ((await setAlias(ownerKey, targetKey, alias)) === "changed") {
    revalidatePath("/", "layout");
  }
  return { status: "success", targetKey, alias };
};

// targetKey: "user:<id>" | "admin:<id>" | "pt"; alias "" clears it.
export const setContactAliasAction = withResultErrorHandling(
  "setContactAlias",
  async (input: { targetKey: string; alias: string }) => {
    const user = await requireUser();

    return save({ kind: "user", id: user.id }, userActorKey(user.id), input);
  },
);

// targetKey: "user:<id>" | "admin:<id>"; alias "" clears it.
export const adminSetContactAliasAction = withResultErrorHandling(
  "adminSetContactAlias",
  async (input: { targetKey: string; alias: string }) => {
    const admin = await requireAdmin();

    return save(
      { kind: "admin", id: admin.id },
      adminActorKey(admin.id),
      input,
    );
  },
);
