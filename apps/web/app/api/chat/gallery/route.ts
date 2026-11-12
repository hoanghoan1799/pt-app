import { type NextRequest, NextResponse } from "next/server";

import { loadGalleryForTrainee } from "@/features/chat/services/chat-gallery";
import { findConversationByUserId } from "@/features/chat/services/chat-queries";
import {
  parseGalleryCursor,
  parseGalleryTab,
} from "@/features/chat/utils/gallery-rules";
import { getApiUser } from "@/services/auth-guard";

const NO_STORE = { "Cache-Control": "no-store" };

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// GET: one page of the photos in the trainee's own conversation, newest
// first (KAN-160); `?tab=photos|stickers|links` picks the list. Never takes a conversation id.
export const GET = async (request: NextRequest) => {
  const user = await getApiUser();

  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }
  const cursor = parseGalleryCursor(request.nextUrl.searchParams.get("before"));

  if (!cursor.ok) {
    return json({ error: "invalid_query" }, 400);
  }
  const conversation = await findConversationByUserId(user.id);
  const result = await loadGalleryForTrainee(
    conversation?.id ?? null,
    cursor.before,
    parseGalleryTab(request.nextUrl.searchParams.get("tab")),
  );

  return result.status === "ok"
    ? json(result.page)
    : json({ error: "not_found" }, 404);
};
