import { type NextRequest, NextResponse } from "next/server";

import { checkPhoto, PHOTO_ERRORS } from "@/features/chat/utils/photo-rules";
import { DM_PHOTO_MAX_BYTES } from "@/features/social/constants/dm";
import { resolveDmView } from "@/features/social/services/dm-access";
import { createPendingDmPhoto } from "@/features/social/services/dm-photos";
import { actorOfUser } from "@/features/social/services/post-context";
import { parseDmId } from "@/features/social/utils/dm-rules";
import { getApiUser } from "@/services/auth-guard";
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

// POST ?conversationId=<id>: the raw image bytes (resized in the browser).
// Only a member who may still write in that conversation can upload; the
// photo stays pending until a message carries it.
export const POST = async (request: NextRequest) => {
  if (!isSameOrigin(request)) {
    return reply({ error: "forbidden" }, 403);
  }
  const user = await getApiUser();

  if (!user) {
    return reply({ error: "unauthorized" }, 401);
  }
  const conversationId = parseDmId(
    request.nextUrl.searchParams.get("conversationId") ?? "",
  );
  const view =
    conversationId === null
      ? null
      : await resolveDmView(conversationId, actorOfUser(user));

  if (!view || view.access !== "member") {
    return reply({ error: "not_found" }, 404);
  }
  if (view.readOnlyReason !== null) {
    return reply({ error: "read_only", message: view.readOnlyReason }, 403);
  }
  const declared = Number(request.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > DM_PHOTO_MAX_BYTES) {
    return tooLarge();
  }
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());

    if (bytes.length > DM_PHOTO_MAX_BYTES) {
      return tooLarge();
    }
    const check = checkPhoto(bytes);

    if (!check.ok) {
      return check.error === "too_large"
        ? tooLarge()
        : reply({ error: "bad_image", message: PHOTO_ERRORS.BAD_IMAGE }, 400);
    }
    const id = await createPendingDmPhoto({
      conversationId: view.conversation.id,
      uploaderId: user.id,
      mime: check.mime,
      width: check.width,
      height: check.height,
      bytes,
    });

    return reply({ photo: { id } }, 201);
  } catch (error) {
    logServerError("uploadDmPhoto", error);
    return reply({ error: "failed", message: PHOTO_ERRORS.GENERIC }, 500);
  }
};
