// `authAt` (user sessions): when the user last typed their password, in
// seconds. The proxy's daily refresh re-signs the token with a new `iat` but
// keeps `authAt`, so a password reset still signs out older sessions.
export type SessionPayload =
  | { role: "admin"; adminId: number }
  // Admin unlock cookie (KAN-160); never accepted as a session.
  | { role: "unlock"; adminId: number }
  | { role: "user"; userId: number; authAt?: number };

// `issuedAt` / `expiresAt` are the JWT `iat` / `exp`, in seconds since the epoch.
export type VerifiedSession = SessionPayload & {
  issuedAt: number;
  // Always set by verifySession; optional so tests can build sessions.
  expiresAt?: number;
};

export type SessionRole = SessionPayload["role"];
