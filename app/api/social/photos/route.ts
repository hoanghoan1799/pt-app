import { type NextRequest, NextResponse } from "next/server";

import { checkPhoto, PHOTO_ERRORS } from "@/features/chat/utils/photo-rules";
import { POST_PHOTO_MAX_BYTES } from "@/features/social/constants/social";
import {
  createPendingPostPhoto,
  uploaderKeyOf,
} from "@/features/social/services/post-photos";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";
import { logServerError } from "@/services/logger";

const NO_STORE = { "Cache-Control": "no-store" };

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// A cookie-authenticated write must come from this site.
const isSameOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");

  return origin === null || origin === request.nextUrl.origin;
};

type Uploader = { kind: "user" | "admin"; id: number } | "terms" | null;

// A trainee (who accepted the terms) uploads as themselves; an admin names
// `?as=admin`.
const resolveUploader = async (request: NextRequest): Promise<Uploader> => {
  if (request.nextUrl.searchParams.get("as") === "admin") {
    const admin = await getApiAdmin();

    return admin ? { kind: "admin", id: admin.id } : null;
  }
  const user = await getApiUser();

  if (!user) {
    return null;
  }
  return hasAcceptedTerms(user) ? { kind: "user", id: user.id } : "terms";
};

const tooLarge = () =>
  reply({ error: "too_large", message: PHOTO_ERRORS.TOO_LARGE }, 413);

// POST: the raw image bytes (resized in the browser). Type and size are read
// from the bytes; the photo stays pending until a post uses it.
export const POST = async (request: NextRequest) => {
  if (!isSameOrigin(request)) {
    return reply({ error: "forbidden" }, 403);
  }
  const uploader = await resolveUploader(request);

  if (!uploader) {
    return reply({ error: "unauthorized" }, 401);
  }
  if (uploader === "terms") {
    return reply({ error: "terms_required" }, 403);
  }
  const declared = Number(request.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > POST_PHOTO_MAX_BYTES) {
    return tooLarge();
  }
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());

    if (bytes.length > POST_PHOTO_MAX_BYTES) {
      return tooLarge();
    }
    const check = checkPhoto(bytes);

    if (!check.ok) {
      return check.error === "too_large"
        ? tooLarge()
        : reply({ error: "bad_image", message: PHOTO_ERRORS.BAD_IMAGE }, 400);
    }
    const id = await createPendingPostPhoto({
      uploaderKey: uploaderKeyOf(uploader),
      mime: check.mime,
      width: check.width,
      height: check.height,
      bytes,
    });

    return reply({ photo: { id } }, 201);
  } catch (error) {
    logServerError("uploadSocialPhoto", error);
    return reply({ error: "failed", message: PHOTO_ERRORS.GENERIC }, 500);
  }
};
