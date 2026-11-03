// `authAt` (user sessions): when the user last typed their password, in
// seconds. The proxy's daily refresh re-signs the token with a new `iat` but
// keeps `authAt`, so a password reset still signs out older sessions.
export type SessionPayload =
  | { role: "admin"; adminId: number }
  | { role: "user"; userId: number; authAt?: number };

// `issuedAt` is the JWT `iat`, in seconds since the epoch.
export type VerifiedSession = SessionPayload & { issuedAt: number };

export type SessionRole = SessionPayload["role"];
