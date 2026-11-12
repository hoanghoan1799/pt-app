import { type ActorRole, type AdminRole, toAdminRole } from "@pt/contracts";

import {
  isLockedFor,
  isRevealActive,
  type SubjectKind,
} from "./session-rules.js";

export type ClientKind = "web" | "ios" | "android";

// What the API shows about a session; never the token or its hash.
export type SessionInfo = {
  id: string;
  clientKind: ClientKind;
  clientName: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

export type UserActor = {
  kind: "user";
  id: number;
  role: "trainee";
  name: string;
  email: string | null;
  locale: string | null;
  ptAdminId: number | null;
  session: SessionInfo;
};

export type AdminActor = {
  kind: "admin";
  id: number;
  role: AdminRole;
  username: string;
  verified: boolean;
  locale: string | null;
  presenceHidden: boolean;
  hasPasscode: boolean;
  unlockedUntil: Date | null;
  revealedUntil: Date | null;
  // Derived at request time from the session columns.
  locked: boolean;
  revealed: boolean;
  session: SessionInfo;
};

// The caller of a request, built by the SessionGuard.
export type AuthActor = UserActor | AdminActor;

// Rows the guard reads; hashes and photos are never selected.
export type UserSubjectRow = {
  id: number;
  name: string;
  email: string | null;
  locale: string | null;
  ptAdminId: number | null;
};

export type AdminSubjectRow = {
  id: number;
  username: string;
  role: string | null;
  verifiedAt: Date | null;
  locale: string | null;
  presenceHidden: boolean | null;
  hasPasscode: boolean;
};

export type SessionState = SessionInfo & {
  subjectKind: SubjectKind;
  unlockedUntil: Date | null;
  revealedUntil: Date | null;
};

export const toActorRole = (actor: AuthActor): ActorRole =>
  actor.kind === "user" ? "trainee" : actor.role;

export const buildUserActor = (
  state: SessionState,
  row: UserSubjectRow,
): UserActor => ({
  kind: "user",
  id: row.id,
  role: "trainee",
  name: row.name,
  email: row.email,
  locale: row.locale,
  ptAdminId: row.ptAdminId,
  session: pickInfo(state),
});

export const buildAdminActor = (
  state: SessionState,
  row: AdminSubjectRow,
  now: Date,
): AdminActor => {
  const locked = isLockedFor(row.hasPasscode, state.unlockedUntil, now);

  return {
    kind: "admin",
    id: row.id,
    // Null role = super admin (admins created before roles existed).
    role: toAdminRole(row.role),
    username: row.username,
    verified: row.verifiedAt !== null,
    locale: row.locale,
    presenceHidden: row.presenceHidden ?? false,
    hasPasscode: row.hasPasscode,
    unlockedUntil: state.unlockedUntil,
    revealedUntil: state.revealedUntil,
    locked,
    // A locked session never reveals, whatever the column says.
    revealed: !locked && isRevealActive(state.revealedUntil, now),
    session: pickInfo(state),
  };
};

const pickInfo = (state: SessionState): SessionInfo => ({
  id: state.id,
  clientKind: state.clientKind,
  clientName: state.clientName,
  createdAt: state.createdAt,
  lastSeenAt: state.lastSeenAt,
  expiresAt: state.expiresAt,
});
