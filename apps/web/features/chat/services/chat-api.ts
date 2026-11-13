import "server-only";

import { NextResponse } from "next/server";

import { webizeUrls } from "@/features/chat/utils/api-urls";
import { routeErrorKey } from "@/features/chat/utils/route-errors";
import {
  type ApiActor,
  apiClient,
  currentRequestId,
} from "@/services/api/client";
import { ApiError, apiErrorFromBody } from "@/services/api/errors";
import { createApiFetch, joinUrl } from "@/services/api/transport";
import { getApiUrl } from "@/services/env";
import { readSessionToken } from "@/services/session";

// Route handlers of the chat area are a thin BFF over the API: the browser
// keeps today's URLs and JSON, this module turns an API answer into that JSON.
// Unlike `callApi` nothing here redirects: a polling fetch gets a 401, not the
// login page.

const NO_STORE = { "Cache-Control": "no-store" };

type FetchResult<Data> = {
  data?: Data;
  error?: unknown;
  response: Response;
};

export type Asked<Data> =
  { ok: true; status: number; data: Data } | { ok: false; error: ApiError };

export const askApi = async <Data>(
  actor: ApiActor,
  call: (
    api: Awaited<ReturnType<typeof apiClient>>,
  ) => Promise<FetchResult<Data>>,
  options: Parameters<typeof apiClient>[1] = {},
): Promise<Asked<Data>> => {
  try {
    const result = await call(await apiClient(actor, options));

    if (!result.response.ok) {
      return {
        ok: false,
        error: apiErrorFromBody(result.response.status, result.error),
      };
    }
    return {
      ok: true,
      status: result.response.status,
      data: result.data as Data,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, error };
    }
    throw error;
  }
};

// `{ error, message? }` with the status of the API answer. The message is only
// passed on for a 4xx (text the API chose for the user).
export const routeError = (error: ApiError) => {
  const status = error.kind === "timeout" ? 504 : error.status || 502;
  const key = routeErrorKey(error.code, status);

  return NextResponse.json(
    error.isClientError && status !== 401
      ? { error: key, message: error.message }
      : { error: key },
    { status, headers: NO_STORE },
  );
};

// 200 with the (web-mapped) JSON, 204 as is.
export const routeData = <Data>(asked: Asked<Data>, status?: number) => {
  if (!asked.ok) {
    return routeError(asked.error);
  }
  if (asked.status === 204) {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }
  return NextResponse.json(webizeUrls(asked.data), {
    status: status ?? asked.status,
    headers: NO_STORE,
  });
};

export const routeNoContent = () =>
  new NextResponse(null, { status: 204, headers: NO_STORE });

export const routeUnauthorized = () =>
  NextResponse.json(
    { error: "unauthorized" },
    { status: 401, headers: NO_STORE },
  );

export const routeInvalid = (error = "invalid_query") =>
  NextResponse.json({ error }, { status: 400, headers: NO_STORE });

// A cookie-authenticated write must come from this site.
export const isSameOrigin = (request: Request & { nextUrl: URL }) => {
  const origin = request.headers.get("origin");

  return origin === null || origin === request.nextUrl.origin;
};

// Raw bytes up (a photo, a sticker); the answer is the API's JSON.
export const askUpload = async (
  actor: "user" | "admin",
  path: string,
  request: Request,
  options: { idempotencyKey?: string } = {},
): Promise<Asked<unknown>> => {
  const token = await readSessionToken(actor);

  if (!token) {
    return {
      ok: false,
      error: new ApiError({ status: 401, code: "UNAUTHORIZED", message: "" }),
    };
  }
  try {
    const send = createApiFetch({
      baseUrl: getApiUrl(),
      token,
      requestId: await currentRequestId(),
      ...options,
    });
    const response = await send(joinUrl(getApiUrl(), path), {
      method: "POST",
      body: await request.arrayBuffer(),
      headers: {
        "content-type": request.headers.get("content-type") ?? "image/webp",
      },
    });
    const body = (await response.json().catch(() => undefined)) as unknown;

    return response.ok
      ? { ok: true, status: response.status, data: body }
      : { ok: false, error: apiErrorFromBody(response.status, body) };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, error };
    }
    throw error;
  }
};

const PASS_HEADERS = ["content-type", "content-length", "etag"] as const;

// The bytes of a file the caller may read as a trainee or as an admin (a
// browser can hold both cookies): the first session the API accepts wins.
// Never redirects, so an image tag with a stale cookie just gets a 401/404.
export const proxyChatFile = async (
  request: Request,
  path: string,
  actors: readonly ("admin" | "user")[] = ["admin", "user"],
) => {
  const conditional = request.headers.get("if-none-match");
  let status = 401;

  for (const actor of actors) {
    const token = await readSessionToken(actor);

    if (!token) {
      continue;
    }
    try {
      const send = createApiFetch({
        baseUrl: getApiUrl(),
        token,
        requestId: await currentRequestId(),
      });
      const upstream = await send(joinUrl(getApiUrl(), path), {
        headers: conditional ? { "if-none-match": conditional } : {},
      });

      if (upstream.ok || upstream.status === 304) {
        const headers = new Headers({
          "cache-control": "private, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; sandbox",
        });

        for (const name of PASS_HEADERS) {
          const value = upstream.headers.get(name);

          if (value) {
            headers.set(name, value);
          }
        }
        return new Response(upstream.status === 304 ? null : upstream.body, {
          status: upstream.status,
          headers,
        });
      }
      status = Math.max(status === 401 ? 0 : status, upstream.status);
      await upstream.body?.cancel();
    } catch {
      status = 502;
    }
  }
  return NextResponse.json(
    { error: status === 401 ? "unauthorized" : "not_found" },
    {
      status: status === 401 ? 401 : status === 502 ? 502 : 404,
      headers: NO_STORE,
    },
  );
};

export const actorOf = (request: { nextUrl: URL }): "user" | "admin" =>
  request.nextUrl.searchParams.get("as") === "admin" ? "admin" : "user";
