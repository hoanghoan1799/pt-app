import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { findConversationById } from "@/features/chat/services/chat-queries";
import { loadEditHistory } from "@/features/chat/services/chat-thread";
import { getApiAdmin } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";

const NO_STORE = { "Cache-Control": "no-store" };

const idSchema = z.coerce.number().int().positive();

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// Any admin may read the edit history of any conversation (KAN-138, C4).
export const GET = async (
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ conversationId: string; messageId: string }> },
) => {
  const admin = await getApiAdmin();

  if (!admin) {
    return json({ error: "unauthorized" }, 401);
  }
  const raw = await params;
  const conversationId = idSchema.safeParse(raw.conversationId);
  const messageId = idSchema.safeParse(raw.messageId);

  if (!conversationId.success || !messageId.success) {
    return json({ error: "invalid_query" }, 400);
  }
  const conversation = await findConversationById(conversationId.data);
  const edits =
    conversation && (await canAdminAccessUser(admin.id, conversation.userId))
      ? await loadEditHistory(conversation.id, messageId.data)
      : null;

  if (!edits) {
    return json({ error: "not_found" }, 404);
  }
  return json({ edits });
};
