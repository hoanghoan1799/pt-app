// Domain events of the session lifecycle, for the realtime gateway (it closes
// the sockets of a session that ended). Emitted after the change is stored.

export const SESSION_EVENTS = {
  revoked: "session.revoked",
  revokedAll: "session.revoked_all",
  locked: "session.locked",
} as const;

export type SessionRevokedEvent = { sessionId: string };
export type SessionRevokedAllEvent = {
  kind: "user" | "admin";
  id: number;
  exceptSessionId: string | null;
};
export type SessionLockedEvent = { sessionId: string };
