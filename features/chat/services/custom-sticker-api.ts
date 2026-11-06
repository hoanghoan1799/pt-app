import "server-only";

import { type NextRequest, NextResponse } from "next/server";

import { isChatEnabled } from "@/features/chat/services/chat-permission";
import type { StickerOwner } from "@/features/chat/services/custom-stickers";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";

const NO_STORE = { "Cache-Control": "no-store" };

export const stickerReply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// The caller's own sticker set. `?as=admin` uses the PT session, otherwise the
// trainee's (a browser may hold both). A locked trainee gets "locked".
export const resolveStickerOwner = async (
  request: NextRequest,
): Promise<StickerOwner | "locked" | null> => {
  if (request.nextUrl.searchParams.get("as") === "admin") {
    const admin = await getApiAdmin();

    return admin ? { kind: "admin", id: admin.id } : null;
  }
  const user = await getApiUser();

  if (!user) {
    return null;
  }
  return isChatEnabled(user) ? { kind: "user", id: user.id } : "locked";
};

// A cookie-authenticated write must come from this site.
export const isSameOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");

  return origin === null || origin === request.nextUrl.origin;
};
