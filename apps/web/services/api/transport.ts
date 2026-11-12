import { API_CODES, ApiError, apiErrorFromBody } from "@/services/api/errors";

// Low-level HTTP to the API. No Next imports, so it is unit-testable with a
// mocked `fetch`. Feature code does not use this directly: see client.ts,
// call.ts and binary.ts.

export const API_TIMEOUT_MS = 10_000;
export const REQUEST_ID_HEADER = "x-request-id";
export const IDEMPOTENCY_HEADER = "idempotency-key";

export type TransportOptions = {
  baseUrl: string;
  // Opaque session token for `Authorization: Bearer`; none = anonymous call.
  token?: string | null;
  requestId?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
  // Authenticated GETs must never be shared between users, so the default is
  // "no-store". A helper may opt in to Next's data cache for public data.
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
  signal?: AbortSignal;
};

const isAbort = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === "TimeoutError" || error.name === "AbortError");

// Reads the body of a failed response without ever throwing.
const readErrorBody = async (response: Response) => {
  try {
    const text = await response.text();

    return text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    return undefined;
  }
};

export const joinUrl = (baseUrl: string, path: string) =>
  `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

// A fetch that adds the auth, request-id and idempotency headers, applies the
// timeout and turns timeouts and network failures into ApiError. Non-2xx
// responses are NOT converted here (openapi-fetch hands them back as `error`);
// use `throwIfNotOk` for raw calls.
export const createApiFetch =
  (options: TransportOptions) =>
  async (input: Request | string, init?: RequestInit): Promise<Response> => {
    const timeoutMs = options.timeoutMs ?? API_TIMEOUT_MS;
    const request = typeof input === "string" ? undefined : input;
    const headers = new Headers(request?.headers ?? init?.headers);

    if (options.token) {
      headers.set("authorization", `Bearer ${options.token}`);
    }
    if (options.requestId) {
      headers.set(REQUEST_ID_HEADER, options.requestId);
    }
    if (options.idempotencyKey) {
      headers.set(IDEMPOTENCY_HEADER, options.idempotencyKey);
    }

    const signals = [AbortSignal.timeout(timeoutMs)];

    if (options.signal) {
      signals.push(options.signal);
    }

    const method = request?.method ?? init?.method ?? "GET";
    const url = request?.url ?? String(input);
    const path = new URL(url, options.baseUrl).pathname;
    const fetchInit = {
      ...init,
      headers,
      cache: options.cache ?? "no-store",
      signal: AbortSignal.any(signals),
      ...(options.next ? { next: options.next } : {}),
    } satisfies RequestInit & { next?: unknown };

    try {
      return await fetch(request ?? input, fetchInit);
    } catch (error) {
      const timedOut = isAbort(error) && !options.signal?.aborted;

      throw new ApiError({
        kind: timedOut ? "timeout" : "network",
        status: 0,
        code: timedOut ? API_CODES.TIMEOUT : API_CODES.UNREACHABLE,
        message: timedOut
          ? `API did not answer within ${timeoutMs} ms`
          : "API is not reachable",
        method,
        path,
      });
    }
  };

// For raw (non openapi-fetch) calls: returns the response when it is 2xx or
// 3xx-not-modified and throws the ApiError built from `{code,message,ref}`.
export const throwIfNotOk = async (
  response: Response,
  context: { method?: string; path?: string } = {},
) => {
  if (response.ok || response.status === 304) {
    return response;
  }
  throw apiErrorFromBody(
    response.status,
    await readErrorBody(response),
    context,
  );
};
