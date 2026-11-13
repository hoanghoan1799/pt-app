import { type NextRequest, NextResponse } from "next/server";

import { PHOTO_ERRORS } from "@/features/chat/utils/photo-rules";
import { POST_PHOTO_MAX_BYTES } from "@/features/social/constants/social";
import { uploadApiBinary } from "@/services/api/binary";
import { ApiError } from "@/services/api/errors";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";
import { localizeResult } from "@/services/localize-message";
import { logServerError } from "@/services/logger";

const NO_STORE = { "Cache-Control": "no-store" };

const reply = async (body: unknown, status: number) =>
  NextResponse.json(await localizeResult(body), {
    status,
    headers: NO_STORE,
  });

// A cookie-authenticated write must come from this site.
const isSameOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");

  return origin === null || origin === request.nextUrl.origin;
};

const tooLarge = () =>
  reply({ error: "too_large", message: PHOTO_ERRORS.TOO_LARGE }, 413);

// POST: the raw image bytes (resized in the browser), sent on to the API as
// they are. The API checks type and size and the terms; the photo stays
// pending until a post uses it. A trainee uploads as themselves; an admin
// names `?as=admin`.
export const POST = async (request: NextRequest) => {
  if (!isSameOrigin(request)) {
    return reply({ error: "forbidden" }, 403);
  }
  const actor =
    request.nextUrl.searchParams.get("as") === "admin" ? "admin" : "user";
  const signedIn = actor === "admin" ? await getApiAdmin() : await getApiUser();

  if (!signedIn) {
    return reply({ error: "unauthorized" }, 401);
  }
  const declared = Number(request.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > POST_PHOTO_MAX_BYTES) {
    return tooLarge();
  }
  try {
    const body = await request.arrayBuffer();

    if (body.byteLength > POST_PHOTO_MAX_BYTES) {
      return tooLarge();
    }
    const created = await uploadApiBinary<{ photo: { id: number } }>(
      actor,
      "/v1/social/photos",
      {
        body,
        contentType: request.headers.get("content-type") ?? "image/webp",
      },
    );

    return reply({ photo: { id: created.photo.id } }, 201);
  } catch (error) {
    if (error instanceof ApiError && error.isClientError) {
      return reply({ error: error.code, message: error.message }, error.status);
    }
    logServerError("uploadSocialPhoto", error);
    return reply({ error: "failed", message: PHOTO_ERRORS.GENERIC }, 500);
  }
};
