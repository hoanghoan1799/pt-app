import {
  ALIAS_MAX_LENGTH,
  ALIAS_MESSAGES,
  PT_ALIAS_TARGET,
} from "./constants.js";
import { z } from "zod";

// Private nicknames (Zalo style): what ONE person (the owner) calls another;
// nobody else ever sees it. Keys are actor keys "user:<id>" / "admin:<id>"; the
// one special target is "pt" (a trainee owner only), the PT side as a whole.

const ACTOR_KEY = /^(user|admin):([1-9]\d{0,14})$/;

export type ActorKind = "user" | "admin";

export type ActorRef = { kind: ActorKind; id: number };

export const userActorKey = (id: number) => `user:${id}`;
export const adminActorKey = (id: number) => `admin:${id}`;

// Strict: "user:0", "user:1:2", "user:-3" and "user:" are not keys.
export const parseActorRef = (key: string): ActorRef | null => {
  const match = ACTOR_KEY.exec(key);

  return match ? { kind: match[1] as ActorKind, id: Number(match[2]) } : null;
};

export const isActorKey = (key: string) => ACTOR_KEY.test(key);

export const aliasLength = (value: string) => Array.from(value).length;

// Trimmed, whitespace collapsed; empty clears. The limit counts characters,
// not UTF-16 units, so emoji and Vietnamese diacritics are not penalised.
export const aliasValueSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .refine(
    (value) => aliasLength(value) <= ALIAS_MAX_LENGTH,
    ALIAS_MESSAGES.INVALID,
  )
  .refine((value) => !/\p{Cc}/u.test(value), ALIAS_MESSAGES.INVALID);

export const aliasTargetSchema = z
  .string()
  .refine(
    (value) => value === PT_ALIAS_TARGET || isActorKey(value),
    ALIAS_MESSAGES.INVALID,
  );

export type AliasTargetCheck = "ok" | "invalid" | "self" | "pt-not-allowed";

// Pure part of "may this owner alias that target": shape, not yourself, and
// "pt" only for a trainee. Whether the target exists and is visible to the
// owner is checked against the database by the caller.
export const checkAliasTarget = (
  ownerKey: string,
  targetKey: string,
): AliasTargetCheck => {
  const owner = parseActorRef(ownerKey);

  if (!owner) {
    return "invalid";
  }
  if (targetKey === PT_ALIAS_TARGET) {
    return owner.kind === "user" ? "ok" : "pt-not-allowed";
  }
  if (!isActorKey(targetKey)) {
    return "invalid";
  }
  return targetKey === ownerKey ? "self" : "ok";
};

// The alias if there is one, else the real name. Blank aliases count as none.
export const resolveDisplayName = (
  alias: string | null | undefined,
  realName: string,
) => {
  const trimmed = alias?.trim();

  return trimmed ? trimmed : realName;
};

export type LegacyNickname = {
  // chat_nicknames.target_key: "user", "pt" or "admin:<id>".
  targetKey: string;
  // chat_nicknames.set_by_key: "user" or "admin:<id>".
  setByKey: string;
  nickname: string;
  // The conversation's trainee.
  conversationUserId: number;
};

export type MigratedAlias = {
  ownerKey: string;
  targetKey: string;
  alias: string;
};

const globalKey = (key: string, conversationUserId: number) =>
  key === "user" ? userActorKey(conversationUserId) : key;

// One shared KAN-141 nickname -> the setter's private alias. Rows that cannot
// be private aliases are dropped: the setter naming themselves, an unknown
// key, an empty value, or an admin naming the "pt" side.
export const mapLegacyNickname = (
  row: LegacyNickname,
): MigratedAlias | null => {
  const alias = aliasValueSchema.safeParse(row.nickname);

  if (!alias.success || alias.data === "") {
    return null;
  }
  const ownerKey = globalKey(row.setByKey, row.conversationUserId);
  const targetKey = globalKey(row.targetKey, row.conversationUserId);

  if (checkAliasTarget(ownerKey, targetKey) !== "ok") {
    return null;
  }
  return { ownerKey, targetKey, alias: alias.data };
};
