import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadChatProfile } from "@/features/chat/services/chat-profile";
import {
  findConversationById,
  getPeerReadCursor,
  listMessages,
} from "@/features/chat/services/chat-queries";
import { loadChanges } from "@/features/chat/services/chat-thread";
import {
  parseChangedSince,
  parseHistoryQuery,
} from "@/features/chat/utils/chat-query";
import { serializeLastSeen } from "@/features/chat/utils/presence";
import { getApiAdmin } from "@/services/auth-guard";
import { findUserById } from "@/services/users";

const NO_STORE = { "Cache-Control": "no-store" };

const conversationIdSchema = z.coerce.number().int().positive();

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// Any admin may read any conversation (shared PT inbox, D4). In Next 16
// `params` is a Promise.
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) => {
  const admin = await getApiAdmin();

  if (!admin) {
    return json({ error: "unauthorized" }, 401);
  }
  const id = conversationIdSchema.safeParse((await params).conversationId);
  const query = parseHistoryQuery(request.nextUrl.searchParams);

  if (!id.success || !query.success) {
    return json({ error: "invalid_query" }, 400);
  }
  const conversation = await findConversationById(id.data);
  const trainee = conversation ? await findUserById(conversation.userId) : null;

  if (!conversation || !trainee) {
    return json({ error: "not_found" }, 404);
  }
  const [{ messages, hasMore }, changed, peerReadUpTo, profile] =
    await Promise.all([
      listMessages(conversation.id, query.data),
      loadChanges(
        conversation.id,
        parseChangedSince(request.nextUrl.searchParams.get("changedSince")),
        conversation.lastChangeAt?.getTime() ?? 0,
      ),
      getPeerReadCursor(conversation.id, "admin"),
      loadChatProfile(conversation.id),
    ]);

  return json({
    messages,
    hasMore,
    ...changed,
    profile,
    peerReadUpTo,
    chatEnabled: trainee.chatEnabled === true,
    userId: trainee.id,
    peerLastSeenAt: serializeLastSeen(trainee.lastSeenAt),
  });
};
