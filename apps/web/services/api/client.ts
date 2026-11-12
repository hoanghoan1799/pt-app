import "server-only";

import { headers } from "next/headers";
import createClient from "openapi-fetch";

import type { paths } from "@/services/api/schema";
import {
  createApiFetch,
  REQUEST_ID_HEADER,
  type TransportOptions,
} from "@/services/api/transport";
import { getApiUrl } from "@/services/env";
import { readSessionToken } from "@/services/session";

// Whose session to send: the trainee cookie, the admin cookie, or none (login).
export type ApiActor = "user" | "admin" | "none";

export type ApiClientOptions = Pick<
  TransportOptions,
  "timeoutMs" | "cache" | "next" | "signal" | "idempotencyKey"
> & {
  // Overrides the cookie (tests, or a token the caller just received).
  token?: string | null;
  requestId?: string;
};

// The id of the incoming browser request when a proxy/CDN set one, otherwise a
// fresh one: the same id shows up in the web and the API logs.
export const currentRequestId = async () => {
  try {
    return (await headers()).get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  } catch {
    // Outside a request (scripts, tests).
    return crypto.randomUUID();
  }
};

export const resolveToken = async (actor: ApiActor) =>
  actor === "none" ? undefined : await readSessionToken(actor);

// Typed `openapi-fetch` client for the API (types: services/api/schema.d.ts).
// Server-side only: it reads the httpOnly session cookie and sends it as a
// Bearer token. Most code should call it through `callApi` (call.ts) so errors,
// 401 and the admin lock are handled in one place.
export const apiClient = async (
  actor: ApiActor,
  options: ApiClientOptions = {},
) => {
  const { token, requestId, ...transport } = options;
  const fetchWithAuth = createApiFetch({
    ...transport,
    baseUrl: getApiUrl(),
    token: token !== undefined ? token : await resolveToken(actor),
    requestId: requestId ?? (await currentRequestId()),
  });

  return createClient<paths>({
    baseUrl: getApiUrl(),
    fetch: (request) => fetchWithAuth(request),
  });
};

export type ApiClient = Awaited<ReturnType<typeof apiClient>>;
