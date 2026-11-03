import type { VerifiedSession } from "@/types/session";

type UserSession = Extract<VerifiedSession, { role: "user" }>;

// When the user last authenticated. Tokens issued before `authAt` existed
// fall back to `iat`.
export const sessionAuthTime = (session: UserSession) =>
  session.authAt ?? session.issuedAt;

// Payload for the proxy's sliding refresh: a new `iat`, same `authAt`.
export const refreshedUserPayload = (session: UserSession) => ({
  role: "user" as const,
  userId: session.userId,
  authAt: sessionAuthTime(session),
});

// A session is stale when it was issued (JWT `iat`, whole seconds) before the
// password last changed. Both sides are whole seconds, so the fresh session a
// trainee gets right after changing their own password is not stale.
export const isSessionStale = (
  issuedAtSeconds: number,
  passwordChangedAt: Date | null,
) => {
  if (!passwordChangedAt) {
    return false;
  }
  return issuedAtSeconds < Math.floor(passwordChangedAt.getTime() / 1000);
};
