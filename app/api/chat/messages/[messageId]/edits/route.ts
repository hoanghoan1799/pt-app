import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { findConversationByUserId } from "@/features/chat/services/chat-queries";
import { loadEditHistory } from "@/features/chat/services/chat-thread";
import { getApiUser } from "@/services/auth-guard";

const NO_STORE = { "Cache-Control": "no-store" };

const idSchema = z.coerce.number().int().positive();

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// Previous bodies of a message in the trainee's own conversation (KAN-138,
// spec C4: both people see the history). In Next 16 `params` is a Promise.
export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) => {
  const user = await getApiUser();

  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }
  const messageId = idSchema.safeParse((await params).messageId);

  if (!messageId.success) {
    return json({ error: "invalid_query" }, 400);
  }
  const conversation = await findConversationByUserId(user.id);
  const edits = conversation
    ? await loadEditHistory(conversation.id, messageId.data)
    : null;

  if (!edits) {
    return json({ error: "not_found" }, 404);
  }
  return json({ edits });
};
