import {
  type AdminRole,
  socialActorKey,
  type SocialAuthorKind,
} from "@pt/contracts";

import type { AuthActor } from "../auth/actor.js";
import { type Locale, toLocale } from "./notifications/notification-content.js";

// Who is looking at, or writing, social content. `revealed` only matters for
// admins: hidden trainees stay out of reach until the passcode reveal.
// `locale` picks the copy of fallback names and notification texts.
export type SocialActor =
  | { kind: "user"; id: number; locale?: Locale }
  | {
      kind: "admin";
      id: number;
      role: AdminRole;
      revealed: boolean;
      locale?: Locale;
    };

export type AuthorRef = { kind: SocialAuthorKind; id: number };

export const toSocialActor = (actor: AuthActor): SocialActor =>
  actor.kind === "user"
    ? { kind: "user", id: actor.id, locale: toLocale(actor.locale) }
    : {
        kind: "admin",
        id: actor.id,
        role: actor.role,
        revealed: actor.revealed,
        locale: toLocale(actor.locale),
      };

export const keyOf = (who: AuthorRef) => socialActorKey(who.kind, who.id);

export const isSameAccount = (a: AuthorRef, b: AuthorRef) =>
  a.kind === b.kind && a.id === b.id;

export const isSuperAdmin = (actor: SocialActor) =>
  actor.kind === "admin" && actor.role === "super_admin";
