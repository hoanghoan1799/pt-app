import { type NextRequest, NextResponse } from "next/server";

import {
  actorOf,
  askUpload,
  isSameOrigin,
  routeData,
  routeError,
  routeInvalid,
} from "@/features/chat/services/chat-api";
import {
  PHOTO_ERRORS,
  PHOTO_MAX_BYTES,
} from "@/features/chat/utils/photo-rules";
import { parseRouteId } from "@/features/chat-groups/utils/group-ids";
import { logServerError } from "@/services/logger";

const NO_STORE = { "Cache-Control": "no-store" };

// POST: the raw image bytes (the browser already resized and re-encoded
// them). The group and the uploader come from the session; the API checks the
// membership and the same rules as sending (chat off, restricted,
// managers-only) and reads type and size from the bytes. The photo stays
// pending until the send action attaches it.
export const POST = async (
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) => {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: NO_STORE },
    );
  }
  const groupId = parseRouteId((await params).groupId);

  if (groupId === null) {
    return routeInvalid();
  }
  const declared = Number(request.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > PHOTO_MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: PHOTO_ERRORS.TOO_LARGE },
      { status: 413, headers: NO_STORE },
    );
  }
  try {
    const asked = await askUpload(
      actorOf(request),
      `/v1/chat/groups/${groupId}/photos`,
      request,
    );

    return asked.ok ? routeData(asked, 201) : routeError(asked.error);
  } catch (error) {
    logServerError("uploadGroupPhoto", error);
    return NextResponse.json(
      { error: "failed", message: PHOTO_ERRORS.GENERIC },
      { status: 500, headers: NO_STORE },
    );
  }
};
