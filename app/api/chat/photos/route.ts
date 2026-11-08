import { type NextRequest, NextResponse } from "next/server";

import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  createPendingPhoto,
  photoUploaderKey,
} from "@/features/chat/services/chat-photos";
import { getOrCreateConversation } from "@/features/chat/services/chat-queries";
import {
  checkPhoto,
  PHOTO_ERRORS,
  PHOTO_MAX_BYTES,
} from "@/features/chat/utils/photo-rules";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";
import { logServerError } from "@/services/logger";
import { findUserById } from "@/services/users";

const NO_STORE = { "Cache-Control": "no-store" };

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// A cookie-authenticated write must come from this site.
const isSameOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");

  return origin === null || origin === request.nextUrl.origin;
};

type Target =
  { conversationUserId: number; uploaderKey: string } | "locked" | null;

// Who is uploading, and into whose conversation. A trainee always uploads into
// their own; a PT names the trainee (`?as=admin&userId=`) and needs access to
// that trainee. Chat must be enabled for the trainee either way.
const resolveTarget = async (request: NextRequest): Promise<Target> => {
  const params = request.nextUrl.searchParams;

  if (params.get("as") === "admin") {
    const admin = await getApiAdmin();
    const userId = Number(params.get("userId"));

    if (!admin || !Number.isSafeInteger(userId) || userId <= 0) {
      return null;
    }
    const trainee = await findUserById(userId);

    if (!trainee || !(await canAdminAccessUser(admin.id, trainee.id))) {
      return null;
    }
    return isChatEnabled(trainee)
      ? {
          conversationUserId: trainee.id,
          uploaderKey: photoUploaderKey({ kind: "admin", id: admin.id }),
        }
      : "locked";
  }
  const user = await getApiUser();

  if (!user) {
    return null;
  }
  return isChatEnabled(user)
    ? {
        conversationUserId: user.id,
        uploaderKey: photoUploaderKey({ kind: "user" }),
      }
    : "locked";
};

const tooLarge = () =>
  reply({ error: "too_large", message: PHOTO_ERRORS.TOO_LARGE }, 413);

// POST: the raw image bytes (the browser has already resized and re-encoded
// them). Type and size are read from the bytes. The photo stays pending until
// the send action attaches it to a message.
export const POST = async (request: NextRequest) => {
  if (!isSameOrigin(request)) {
    return reply({ error: "forbidden" }, 403);
  }
  const target = await resolveTarget(request);

  if (!target) {
    return reply({ error: "unauthorized" }, 401);
  }
  if (target === "locked") {
    return reply({ error: "chat_locked" }, 403);
  }
  const declared = Number(request.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > PHOTO_MAX_BYTES) {
    return tooLarge();
  }
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const check = checkPhoto(bytes);

    if (!check.ok) {
      return check.error === "too_large"
        ? tooLarge()
        : reply({ error: "bad_image", message: PHOTO_ERRORS.BAD_IMAGE }, 400);
    }
    const conversation = await getOrCreateConversation(
      target.conversationUserId,
    );
    const id = await createPendingPhoto({
      conversationId: conversation.id,
      uploaderKey: target.uploaderKey,
      mime: check.mime,
      width: check.width,
      height: check.height,
      bytes,
    });

    return reply({ photo: { id } }, 201);
  } catch (error) {
    logServerError("uploadChatPhoto", error);
    return reply({ error: "failed", message: PHOTO_ERRORS.GENERIC }, 500);
  }
};
