export type SessionPayload =
  { role: "admin" } | { role: "user"; userId: number };
