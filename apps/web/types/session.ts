// Which cookie / which kind of API session a call is about. The session itself
// is an opaque API token; who it belongs to comes from GET /v1/auth/me.
export type SessionRole = "user" | "admin";
