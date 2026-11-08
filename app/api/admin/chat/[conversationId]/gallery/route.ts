import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadGalleryForAdmin } from "@/features/chat/services/chat-gallery";
import {
  parseGalleryCursor,
  parseGalleryTab,
} from "@/features/chat/utils/gallery-rules";
import { getApiAdmin } from "@/services/auth-guard";

const NO_STORE = { "Cache-Control": "no-store" };

const conversationIdSchema = z.coerce.number().int().positive();

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// GET: one page of the photos in a conversation, newest first (KAN-160). A
// trainee this admin hid is "not found" unless revealed.
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) => {
  const admin = await getApiAdmin();

  if (!admin) {
    return json({ error: "unauthorized" }, 401);
  }
  const id = conversationIdSchema.safeParse((await params).conversationId);
  const cursor = parseGalleryCursor(request.nextUrl.searchParams.get("before"));

  if (!id.success || !cursor.ok) {
    return json({ error: "invalid_query" }, 400);
  }
  const result = await loadGalleryForAdmin(
    admin.id,
    id.data,
    cursor.before,
    parseGalleryTab(request.nextUrl.searchParams.get("tab")),
  );

  return result.status === "ok"
    ? json(result.page)
    : json({ error: "not_found" }, 404);
};
