import type { NextRequest } from "next/server";

import { routeData, routeInvalid } from "@/features/chat/services/chat-api";
import { askMySearch } from "@/features/chat/services/chat-search";
import { parseSearchParams } from "@/features/chat/utils/search-rules";

// GET ?q=&before=: one page of messages in the trainee's own conversation that
// contain the query, newest first (KAN-160). Never takes a conversation id.
export const GET = async (request: NextRequest) => {
  const params = parseSearchParams(request.nextUrl.searchParams);

  if (!params.ok) {
    return routeInvalid();
  }
  return routeData(await askMySearch(params.query, params.before));
};
