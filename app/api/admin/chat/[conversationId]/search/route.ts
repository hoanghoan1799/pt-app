import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchForAdmin } from "@/features/chat/services/chat-search";
import { parseSearchParams } from "@/features/chat/utils/search-rules";
import { getApiAdmin } from "@/services/auth-guard";

const NO_STORE = { "Cache-Control": "no-store" };

const conversationIdSchema = z.coerce.number().int().positive();

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// GET ?q=&before=: one page of messages in a conversation that contain the
// query, newest first (KAN-160). A trainee this admin hid is "not found"
// unless revealed.
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) => {
  const admin = await getApiAdmin();

  if (!admin) {
    return json({ error: "unauthorized" }, 401);
  }
  const id = conversationIdSchema.safeParse((await params).conversationId);
  const query = parseSearchParams(request.nextUrl.searchParams);

  if (!id.success || !query.ok) {
    return json({ error: "invalid_query" }, 400);
  }
  const result = await searchForAdmin(
    admin.id,
    id.data,
    query.query,
    query.before,
  );

  return result.status === "ok"
    ? json(result.page)
    : json({ error: "not_found" }, 404);
};
