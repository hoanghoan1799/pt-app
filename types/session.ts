export type SessionPayload =
  { role: "admin"; adminId: number } | { role: "user"; userId: number };

// `issuedAt` is the JWT `iat`, in seconds since the epoch.
export type VerifiedSession = SessionPayload & { issuedAt: number };

export type SessionRole = SessionPayload["role"];
