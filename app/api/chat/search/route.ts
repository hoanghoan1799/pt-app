import { type NextRequest, NextResponse } from "next/server";

import { findConversationByUserId } from "@/features/chat/services/chat-queries";
import { searchForTrainee } from "@/features/chat/services/chat-search";
import { parseSearchParams } from "@/features/chat/utils/search-rules";
import { getApiUser } from "@/services/auth-guard";

const NO_STORE = { "Cache-Control": "no-store" };

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// GET ?q=&before=: one page of messages in the trainee's own conversation that
// contain the query, newest first (KAN-160). Never takes a conversation id.
export const GET = async (request: NextRequest) => {
  const user = await getApiUser();

  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }
  const params = parseSearchParams(request.nextUrl.searchParams);

  if (!params.ok) {
    return json({ error: "invalid_query" }, 400);
  }
  const conversation = await findConversationByUserId(user.id);
  const result = await searchForTrainee(
    conversation?.id ?? null,
    params.query,
    params.before,
  );

  return result.status === "ok"
    ? json(result.page)
    : json({ error: "not_found" }, 404);
};
