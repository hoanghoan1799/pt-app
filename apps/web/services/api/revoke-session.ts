import { createApiFetch } from "@/services/api/transport";
import { getApiUrl } from "@/services/env";

// A dropped cookie must not leave a live token behind, but dropping it must
// never wait on the API for long.
export const REVOKE_TIMEOUT_MS = 2_000;

// Best effort POST /v1/auth/logout with the token of a session cookie the web
// is about to drop. Every failure (API down, timeout, already expired) is
// ignored: the cookie is cleared either way.
export const revokeApiSession = async (token: string | undefined) => {
  if (!token) {
    return;
  }

  try {
    const baseUrl = getApiUrl();
    const apiFetch = createApiFetch({
      baseUrl,
      token,
      timeoutMs: REVOKE_TIMEOUT_MS,
    });

    await apiFetch(`${baseUrl}/v1/auth/logout`, { method: "POST" });
  } catch {
    // Ignored on purpose, see above.
  }
};
