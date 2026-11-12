"use server";

import { revalidatePath } from "next/cache";

import { ALIAS_MESSAGES } from "@/features/contact-aliases/constants/messages";
import type { SetAliasResult } from "@/features/contact-aliases/types/contact-aliases";
import { setAliasInputSchema } from "@/features/contact-aliases/utils/alias-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import { type ApiActor } from "@/services/api/client";
import { requireAdmin, requireUser } from "@/services/auth-guard";

// Private nicknames. The owner is always the signed-in account (the API reads
// it from the session); the input only names the target. Only the owner's own
// pages are refreshed: nobody else is told, because nobody else's view changes.
// The API decides if the target exists and may be seen (ALIAS_TARGET_NOT_FOUND,
// ALIAS_SELF, ALIAS_INVALID carry the same messages as before).

const fail = (message: string): SetAliasResult => ({
  status: "error",
  message,
});

const save = async (
  actor: Exclude<ApiActor, "none">,
  input: unknown,
): Promise<SetAliasResult> => {
  const parsed = setAliasInputSchema.safeParse(input);

  if (!parsed.success) {
    return fail(ALIAS_MESSAGES.INVALID);
  }
  const { targetKey, alias } = parsed.data;
  const outcome = await tryApi(actor, (api) =>
    api.PUT("/v1/contact-aliases/{targetKey}", {
      params: { path: { targetKey } },
      body: { alias },
    }),
  );

  if (!outcome.ok) {
    return fail(outcome.error.message);
  }
  revalidatePath("/", "layout");
  return { status: "success", targetKey, alias: outcome.data.alias };
};

// targetKey: "user:<id>" | "admin:<id>" | "pt"; alias "" clears it.
export const setContactAliasAction = withResultErrorHandling(
  "setContactAlias",
  async (input: { targetKey: string; alias: string }) => {
    await requireUser();

    return save("user", input);
  },
);

// targetKey: "user:<id>" | "admin:<id>"; alias "" clears it.
export const adminSetContactAliasAction = withResultErrorHandling(
  "adminSetContactAlias",
  async (input: { targetKey: string; alias: string }) => {
    await requireAdmin();

    return save("admin", input);
  },
);
