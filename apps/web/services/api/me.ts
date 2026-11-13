import "server-only";

import type { MeResponse } from "@pt/contracts";
import { cache } from "react";

import { runApi } from "@/services/api/call";
import { readSessionToken } from "@/services/session";
import type { SessionRole } from "@/types/session";

// Who is signed in, from GET /v1/auth/me with the cookie of `role`. Asked once
// per request (React `cache`): the guard layout, the page and the actions of a
// request all share one call.
//
// Null for no cookie, an ended session (401) or a token that belongs to the
// other kind of account. Anything else (API down, timeout, 5xx) throws, so a
// broken API shows the error page instead of silently logging everyone out.
export const fetchMe = cache(
  async (role: SessionRole): Promise<MeResponse | null> => {
    if (!(await readSessionToken(role))) {
      return null;
    }

    const outcome = await runApi(role, (api) => api.GET("/v1/auth/me"));

    if (outcome.ok) {
      // The openapi-typescript type is structurally the contract type.
      return outcome.data as unknown as MeResponse;
    }
    if (outcome.error.status === 401) {
      return null;
    }
    throw outcome.error;
  },
);
