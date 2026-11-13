# Calling the API from the web (BFF helpers)

The browser talks only to this web app. Server actions and route handlers call
the NestJS API server-to-server with the helpers here. Everything is
`server-only` except `errors.ts`, `transport.ts` and `testing.ts`.

## Files

| File          | What it is                                                                                |
| ------------- | ----------------------------------------------------------------------------------------- |
| `schema.d.ts` | Generated types of `apps/api/openapi.json`. `pnpm --filter @pt/web api:types`; commit it. |
| `client.ts`   | `apiClient(actor, options)`: typed `openapi-fetch` client with auth + headers + timeout.  |
| `call.ts`     | `callApi`, `tryApi`, `runApi`, `unwrap`: errors, 401 and the admin lock in one place.     |
| `binary.ts`   | `proxyApiFile` (stream a file to the browser), `uploadApiBinary`, `apiFetch` (raw).       |
| `errors.ts`   | `ApiError`, `apiErrorToFormState`, validation-message parser.                             |
| `me.ts`       | `fetchMe(role)`: `GET /v1/auth/me`, once per request. Used by `services/auth-guard.ts`.   |
| `testing.ts`  | `fakeAdminMe()` / `fakeUserMe()` for unit tests.                                          |

`schema.d.ts` is checked by `services/api/__tests__/schema.test.ts` (and ci-web
runs on `apps/api/openapi.json` changes): after an API change, regenerate it.

## Which one do I call?

`actor` is whose session to send: `"user"` (trainee cookie), `"admin"` (admin
cookie) or `"none"` (login, public).

```ts
// Returns the data. Throws ApiError otherwise.
const { trainees } = await callApi("admin", (api) =>
  api.GET("/v1/trainees", { params: { query: { q } } }),
);

// A refused request (4xx) comes back instead of throwing: forms, expected branches.
const outcome = await tryApi("user", (api) =>
  api.POST("/v1/users/me/password", { body }),
);
if (!outcome.ok) {
  return apiErrorToFormState(outcome.error, { values });
}
```

- Write the action as before: `requireAdmin()` / `requireUser()` first, Zod on
  the input, then the API call, wrapped in `withFormErrorHandling` /
  `withResultErrorHandling`.
- `callApi` and `tryApi` already redirect: a 401 "session over" goes to
  `/session/end?role=…` (clears the cookie, then the login page) and
  `ADMIN_LOCKED` goes to `/admin/lock`. `tryApi` returns the other 4xx and still
  throws 5xx, timeouts and "API unreachable". Use `passthrough: ["CODE"]` to
  handle a 401/403 code yourself.
- `runApi` never redirects or throws for an API answer (used by the auth guard
  and logout).
- Options (third argument): `idempotencyKey` (sent as `Idempotency-Key`),
  `timeoutMs` (default 10 s), `signal`, `cache`/`next` (only for public data;
  default is `no-store`, so one user's GET is never shared with another).
  `X-Request-Id` is the incoming request's id or a fresh UUID.

## Errors and what users see

The API answers `{ code, message, ref, details? }`.

- 4xx: `message` is text the API chose for the user (Vietnamese). It is shown as
  is, plus `ref` (also in production). A `VALIDATION_FAILED` message
  (`"email: …; name: …"`) is parsed into `error.fieldErrors`.
- 5xx, timeout, API unreachable: `withFormErrorHandling` /
  `withResultErrorHandling` show only the generic message plus a short
  reference in production; development shows the cause. The real error and the
  API `ref` are in the server log line (`[pt-app] <context> failed`).

## Files (avatars, photos, stickers)

```ts
// app/api/avatar/[kind]/[id]/route.ts
export const GET = (request: NextRequest, ctx: RouteContext<...>) =>
  proxyApiFile("user", `/v1/avatars/${kind}/${id}`, { request });

// Upload raw bytes (the API caps images at 2 MB)
const photo = await uploadApiBinary<{ id: number }>("user", "/v1/chat/photos", {
  body: await request.arrayBuffer(),
  contentType: request.headers.get("content-type") ?? "image/webp",
  idempotencyKey,
});
```

`proxyApiFile` forwards `If-None-Match`, passes `ETag`/`Content-Type` on and
forces `private` caching.

## Session

The cookie (`pt_user` 400 days, `pt_admin` 7 days; httpOnly, Secure in
production, SameSite=Lax) holds the opaque API token and nothing else. See
`services/session-cookie.ts`.

- The API slides trainee sessions on use; `proxy.ts` re-sets the cookie on page
  navigations so it never expires under an active trainee. Admin sessions are a
  fixed 7 days (as the API). `POST /v1/auth/refresh` is not used.
- Who is signed in: `requireUser()` / `requireAdmin()` /
  `getApiUser()` / `getApiAdmin()` in `services/auth-guard.ts` (one `/auth/me`
  per request). Admin lock state is `admin.locked`; the reveal window is
  `admin.revealedUntil` (`canSeeHiddenUsers()`).
- Tests: mock `@/services/api/me` with `fakeAdminMe()` / `fakeUserMe()` and let
  the real guards run; mock `@/services/api/call` (`tryApi`/`callApi`) to test an
  action against canned API answers.

## Environment

`API_URL` (server only): base URL of the API. Defaults to
`http://localhost:4000` outside production; required in production.
