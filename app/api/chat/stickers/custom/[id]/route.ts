import { type NextRequest, NextResponse } from "next/server";

import {
  isSameOrigin,
  resolveStickerOwner,
  stickerReply as reply,
} from "@/features/chat/services/custom-sticker-api";
import {
  deleteOwnSticker,
  findStickerForViewer,
  type Viewer,
} from "@/features/chat/services/custom-stickers";
import {
  CUSTOM_STICKER_ERRORS,
  parseCustomStickerId,
} from "@/features/chat/utils/custom-sticker-rules";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";

type Context = { params: Promise<{ id: string }> };

// GET: the picture. 404 for anyone who is neither the owner nor on the other
// side of a conversation it was sent in (never 403, so ids reveal nothing).
// The bytes of an id never change, so a private cache may keep them.
export const GET = async (_request: NextRequest, { params }: Context) => {
  const id = parseCustomStickerId((await params).id);

  if (id === null) {
    return reply({ error: "not_found" }, 404);
  }
  const [admin, user] = await Promise.all([getApiAdmin(), getApiUser()]);

  if (!admin && !user) {
    return reply({ error: "unauthorized" }, 401);
  }
  const viewers: Viewer[] = [
    ...(admin ? [{ kind: "admin" as const, id: admin.id }] : []),
    ...(user ? [{ kind: "user" as const, id: user.id }] : []),
  ];

  for (const viewer of viewers) {
    const found = await findStickerForViewer(id, viewer);

    if (found) {
      return new NextResponse(new Uint8Array(found.data), {
        status: 200,
        headers: {
          "Content-Type": found.mime,
          "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }
  }
  return reply({ error: "not_found" }, 404);
};

// DELETE: remove one of my own stickers.
export const DELETE = async (request: NextRequest, { params }: Context) => {
  if (!isSameOrigin(request)) {
    return reply({ error: "forbidden" }, 403);
  }
  const owner = await resolveStickerOwner(request);

  if (!owner) {
    return reply({ error: "unauthorized" }, 401);
  }
  if (owner === "locked") {
    return reply({ error: "chat_locked" }, 403);
  }
  const id = parseCustomStickerId((await params).id);

  if (id === null || !(await deleteOwnSticker(owner, id))) {
    return reply(
      { error: "not_found", message: CUSTOM_STICKER_ERRORS.NOT_FOUND },
      404,
    );
  }
  return reply({ ok: true }, 200);
};
