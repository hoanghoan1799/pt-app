import "server-only";

import { redirect } from "next/navigation";

import { ROUTES, SESSION_ROLE_PARAM } from "@/constants/routes";
import {
  type ApiActor,
  type ApiClient,
  apiClient,
  type ApiClientOptions,
} from "@/services/api/client";
import {
  ApiError,
  apiErrorFromBody,
  isAdminLockedError,
  isSessionEndedError,
} from "@/services/api/errors";

// What openapi-fetch returns for one request.
type FetchResult<Data> = {
  data?: Data;
  error?: unknown;
  response: Response;
};

type RunOptions = ApiClientOptions;

// Turns an openapi-fetch result into its data, or throws ApiError built from
// the API's `{code,message,ref,details}` body. A 204 gives `undefined`.
export const unwrap = <Data>(result: FetchResult<Data>): Data => {
  if (!result.response.ok) {
    throw apiErrorFromBody(result.response.status, result.error, {
      path: safePath(result.response.url),
    });
  }
  return result.data as Data;
};

const safePath = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
};

export type ApiOutcome<Data> =
  { ok: true; data: Data } | { ok: false; error: ApiError };

// Runs one API call and returns its outcome. Never redirects and never throws
// for a non-2xx answer; a timeout or network failure is also an `ok: false`
// ApiError (status 0). Use for lookups that decide what to do on 401 themselves
// (e.g. getMe in the auth guard).
export const runApi = async <Data>(
  actor: ApiActor,
  call: (api: ApiClient) => Promise<FetchResult<Data>>,
  options: RunOptions = {},
): Promise<ApiOutcome<Data>> => {
  try {
    const api = await apiClient(actor, options);

    return { ok: true, data: unwrap(await call(api)) };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, error };
    }
    throw error;
  }
};

// Where an ended session or a locked admin goes. `redirect` throws, so the
// caller never continues. /session/end clears the stale cookie first (server
// components cannot), then lands on the right login page.
export const redirectForAuthError = (actor: ApiActor, error: ApiError) => {
  if (actor === "admin" && isAdminLockedError(error)) {
    return redirect(ROUTES.ADMIN_LOCK);
  }
  if (actor !== "none" && isSessionEndedError(error)) {
    return redirect(`${ROUTES.SESSION_END}?${SESSION_ROLE_PARAM}=${actor}`);
  }
  return undefined;
};

// Calls the API and returns the data. Throws ApiError for everything else.
// A 401 "session over" redirects to the login page of that role; ADMIN_LOCKED
// redirects to the admin lock screen. Wrap the surrounding action in
// withFormErrorHandling / withResultErrorHandling: they show the API's own
// message for 4xx and only a generic message + reference for 5xx.
//
//   const { pins } = await callApi("admin", (api) =>
//     api.GET("/v1/admins/me/hidden-users"),
//   );
export const callApi = async <Data>(
  actor: ApiActor,
  call: (api: ApiClient) => Promise<FetchResult<Data>>,
  options: RunOptions = {},
): Promise<Data> => {
  const outcome = await runApi(actor, call, options);

  if (outcome.ok) {
    return outcome.data;
  }
  redirectForAuthError(actor, outcome.error);
  throw outcome.error;
};

// Like callApi, but a refused request (4xx the user can act on) comes back as
// `{ ok: false, error }` instead of a throw, for forms and expected branches
// (wrong password, duplicate email, wrong passcode). Session-over and the
// admin lock still redirect; 5xx, timeouts and network failures still throw.
// `passthrough` lists 401/403 codes the caller wants to handle itself
// (PASSCODE_SIGNED_OUT, ADMIN_LOCKED on the lock screen).
export const tryApi = async <Data>(
  actor: ApiActor,
  call: (api: ApiClient) => Promise<FetchResult<Data>>,
  options: RunOptions & { passthrough?: string[] } = {},
): Promise<ApiOutcome<Data>> => {
  const { passthrough = [], ...runOptions } = options;
  const outcome = await runApi(actor, call, runOptions);

  if (outcome.ok) {
    return outcome;
  }
  if (!passthrough.includes(outcome.error.code)) {
    redirectForAuthError(actor, outcome.error);
  }
  if (!outcome.error.isClientError) {
    throw outcome.error;
  }
  return outcome;
};
