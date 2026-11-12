import type { NextRequest } from "next/server";
import { z } from "zod";

import { routeData, routeInvalid } from "@/features/chat/services/chat-api";
import { askConversationSearch } from "@/features/chat/services/chat-search";
import { parseSearchParams } from "@/features/chat/utils/search-rules";

const conversationIdSchema = z.coerce.number().int().positive();

// GET ?q=&before=: one page of messages of a conversation that contain the
// query, newest first (KAN-160). The API answers 404 for a conversation the
// admin may not read.
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) => {
  const id = conversationIdSchema.safeParse((await params).conversationId);
  const query = parseSearchParams(request.nextUrl.searchParams);

  if (!id.success || !query.ok) {
    return routeInvalid();
  }
  return routeData(
    await askConversationSearch(id.data, query.query, query.before),
  );
};
