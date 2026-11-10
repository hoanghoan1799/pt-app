import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { contactAliases } from "@/db/schema";
import {
  adminActorKey,
  isActorKey,
  userActorKey,
} from "@/features/contact-aliases/utils/alias-rules";

// Private nicknames. Everything here is keyed by the OWNER, who always comes
// from the session and never from the request, so one person's aliases can
// never be read or written through another's account.

// Every alias the owner has set, by target key.
export const loadAllAliases = async (
  ownerKey: string,
): Promise<Map<string, string>> => {
  if (!isActorKey(ownerKey)) {
    return new Map();
  }
  const rows = await db
    .select({
      targetKey: contactAliases.targetKey,
      alias: contactAliases.alias,
    })
    .from(contactAliases)
    .where(eq(contactAliases.ownerKey, ownerKey));

  return new Map(rows.map((row) => [row.targetKey, row.alias]));
};

// The owner's aliases for these targets only. Targets without one are absent.
export const loadAliases = async (
  ownerKey: string,
  targetKeys: readonly string[],
): Promise<Map<string, string>> => {
  const wanted = [...new Set(targetKeys)];

  if (wanted.length === 0 || !isActorKey(ownerKey)) {
    return new Map();
  }
  const rows = await db
    .select({
      targetKey: contactAliases.targetKey,
      alias: contactAliases.alias,
    })
    .from(contactAliases)
    .where(
      and(
        eq(contactAliases.ownerKey, ownerKey),
        inArray(contactAliases.targetKey, wanted),
      ),
    );

  return new Map(rows.map((row) => [row.targetKey, row.alias]));
};

// The viewing admin's alias for each trainee, by user id.
export const loadTraineeAliases = async (
  adminId: number,
  userIds: readonly number[],
): Promise<Map<number, string>> => {
  const aliases = await loadAliases(
    adminActorKey(adminId),
    userIds.map(userActorKey),
  );

  return new Map(
    userIds.flatMap((id) => {
      const alias = aliases.get(userActorKey(id));

      return alias ? [[id, alias] as const] : [];
    }),
  );
};

export type SetAliasOutcome = "changed" | "unchanged";

// The input is already validated (target allowed, alias normalised). An empty
// alias clears it; saving the value that is already stored changes nothing.
export const setAlias = async (
  ownerKey: string,
  targetKey: string,
  alias: string,
): Promise<SetAliasOutcome> => {
  const [existing] = await db
    .select({ alias: contactAliases.alias })
    .from(contactAliases)
    .where(
      and(
        eq(contactAliases.ownerKey, ownerKey),
        eq(contactAliases.targetKey, targetKey),
      ),
    );

  if ((existing?.alias ?? "") === alias) {
    return "unchanged";
  }
  if (alias === "") {
    await db
      .delete(contactAliases)
      .where(
        and(
          eq(contactAliases.ownerKey, ownerKey),
          eq(contactAliases.targetKey, targetKey),
        ),
      );
    return "changed";
  }
  await db
    .insert(contactAliases)
    .values({ ownerKey, targetKey, alias, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [contactAliases.ownerKey, contactAliases.targetKey],
      set: { alias, updatedAt: new Date() },
    });
  return "changed";
};

// Several owners at once (a push goes to many people, each with their own
// nickname for the sender): owner key -> that owner's aliases for the targets.
export const loadAliasesForOwners = async (
  ownerKeys: readonly string[],
  targetKeys: readonly string[],
): Promise<Map<string, Map<string, string>>> => {
  const owners = [...new Set(ownerKeys)].filter(isActorKey);
  const targets = [...new Set(targetKeys)];
  const result = new Map<string, Map<string, string>>();

  if (owners.length === 0 || targets.length === 0) {
    return result;
  }
  const rows = await db
    .select({
      ownerKey: contactAliases.ownerKey,
      targetKey: contactAliases.targetKey,
      alias: contactAliases.alias,
    })
    .from(contactAliases)
    .where(
      and(
        inArray(contactAliases.ownerKey, owners),
        inArray(contactAliases.targetKey, targets),
      ),
    );

  for (const row of rows) {
    const aliases = result.get(row.ownerKey) ?? new Map<string, string>();

    aliases.set(row.targetKey, row.alias);
    result.set(row.ownerKey, aliases);
  }
  return result;
};
