import type {
  ActorResponse,
  AuthTokenResponse,
  MeResponse,
  PasscodeStatusResponse,
  SessionListResponse,
  SessionResponse,
} from "@pt/contracts";

import type { SessionInfo } from "./actor.js";
import { type AdminActor, type AuthActor, toActorRole } from "./actor.js";

// Entity/actor -> response. Explicit field lists: a new column never reaches a
// client by accident, and hashes and passcode internals have no field at all.

const iso = (date: Date) => date.toISOString();

export const toSessionResponse = (
  session: SessionInfo,
  currentSessionId: string,
): SessionResponse => ({
  id: session.id,
  clientKind: session.clientKind,
  clientName: session.clientName,
  createdAt: iso(session.createdAt),
  lastSeenAt: iso(session.lastSeenAt),
  expiresAt: iso(session.expiresAt),
  current: session.id === currentSessionId,
});

export const toSessionListResponse = (
  sessions: SessionInfo[],
  currentSessionId: string,
): SessionListResponse => ({
  sessions: sessions.map((session) =>
    toSessionResponse(session, currentSessionId),
  ),
});

export const toActorResponse = (actor: AuthActor): ActorResponse =>
  actor.kind === "user"
    ? {
        kind: "user",
        id: actor.id,
        name: actor.name,
        email: actor.email,
        locale: actor.locale,
        ptAdminId: actor.ptAdminId,
        chatEnabled: actor.chatEnabled,
        termsVersion: actor.termsVersion,
        preferredMealCount: actor.preferredMealCount,
        foodNote: actor.foodNote,
      }
    : {
        kind: "admin",
        id: actor.id,
        username: actor.username,
        role: actor.role,
        verified: actor.verified,
        locale: actor.locale,
        presenceHidden: actor.presenceHidden,
        hasPasscode: actor.hasPasscode,
        locked: actor.locked,
        unlockedUntil: actor.unlockedUntil ? iso(actor.unlockedUntil) : null,
        revealedUntil:
          actor.revealed && actor.revealedUntil
            ? iso(actor.revealedUntil)
            : null,
      };

export const toMeResponse = (actor: AuthActor): MeResponse => ({
  role: toActorRole(actor),
  actor: toActorResponse(actor),
  session: toSessionResponse(actor.session, actor.session.id),
});

export const toAuthTokenResponse = (
  token: string,
  actor: AuthActor,
): AuthTokenResponse => ({ token, ...toMeResponse(actor) });

export const toPasscodeStatusResponse = (
  actor: AdminActor,
): PasscodeStatusResponse => ({
  hasPasscode: actor.hasPasscode,
  locked: actor.locked,
  unlockedUntil: actor.unlockedUntil ? iso(actor.unlockedUntil) : null,
  revealedUntil:
    actor.revealed && actor.revealedUntil ? iso(actor.revealedUntil) : null,
});
