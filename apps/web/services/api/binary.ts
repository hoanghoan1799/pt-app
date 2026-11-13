import "server-only";

import { redirectForAuthError } from "@/services/api/call";
import {
  type ApiActor,
  type ApiClientOptions,
  currentRequestId,
  resolveToken,
} from "@/services/api/client";
import { ApiError } from "@/services/api/errors";
import {
  createApiFetch,
  joinUrl,
  throwIfNotOk,
} from "@/services/api/transport";
import { getApiUrl } from "@/services/env";

// Binary bodies (avatars, chat/social photos, custom stickers). The browser
// never talks to the API: a route handler in this app calls these and streams
// the bytes on.

const PASS_HEADERS = [
  "content-type",
  "content-length",
  "content-disposition",
  "etag",
  "last-modified",
  "cache-control",
] as const;

// Low-level: one call with the session of `actor`, returns the Response and
// throws ApiError for non-2xx (304 is returned). Prefer proxyApiFile or
// uploadApiBinary.
export const apiFetch = async (
  actor: ApiActor,
  path: string,
  init: RequestInit = {},
  options: ApiClientOptions = {},
) => {
  const { token, requestId, ...transport } = options;
  const send = createApiFetch({
    ...transport,
    baseUrl: getApiUrl(),
    token: token !== undefined ? token : await resolveToken(actor),
    requestId: requestId ?? (await currentRequestId()),
  });
  const method = init.method ?? "GET";

  try {
    return await throwIfNotOk(await send(joinUrl(getApiUrl(), path), init), {
      method,
      path,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirectForAuthError(actor, error);
    }
    throw error;
  }
};

// `GET path` and relay the bytes: content type, length, ETag and the API's
// Cache-Control reach the browser; a conditional request (If-None-Match) is
// forwarded so the API can answer 304. Authenticated files default to
// `private` so a shared cache never keeps one user's photo for another.
//
//   export const GET = async (request: NextRequest, { params }: Ctx) =>
//     proxyApiFile("user", `/v1/avatars/${kind}/${id}`, { request });
export const proxyApiFile = async (
  actor: ApiActor,
  path: string,
  { request, ...options }: { request?: Request } & ApiClientOptions = {},
) => {
  const conditional = request?.headers.get("if-none-match");
  const upstream = await apiFetch(
    actor,
    path,
    conditional ? { headers: { "if-none-match": conditional } } : {},
    options,
  );
  const headers = new Headers();

  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  }
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "private, no-store");
  } else if (!/\b(private|no-store)\b/i.test(headers.get("cache-control")!)) {
    headers.set("cache-control", `private, ${headers.get("cache-control")}`);
  }
  return new Response(upstream.status === 304 ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
};

// Sends raw bytes (an image) and returns the JSON the API answers. `body` is
// whatever the browser posted: `await request.arrayBuffer()` or a Blob.
//
//   const created = await uploadApiBinary<PhotoResponse>("user",
//     "/v1/chat/photos", { body: await request.arrayBuffer(),
//     contentType: "image/webp", idempotencyKey });
export const uploadApiBinary = async <Result = unknown>(
  actor: ApiActor,
  path: string,
  {
    body,
    contentType,
    method = "POST",
    ...options
  }: {
    body: ArrayBuffer | Blob | Uint8Array<ArrayBuffer>;
    contentType: string;
    method?: "POST" | "PUT";
  } & ApiClientOptions,
): Promise<Result> => {
  const response = await apiFetch(
    actor,
    path,
    { method, body, headers: { "content-type": contentType } },
    options,
  );

  return response.status === 204
    ? (undefined as Result)
    : ((await response.json()) as Result);
};
