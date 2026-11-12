import { type NextRequest, NextResponse } from "next/server";

import { loadTraineeThread } from "@/features/chat/services/chat-thread";
import {
  parseHistoryQuery,
  parseKnownState,
} from "@/features/chat/utils/chat-query";
import { getApiUser } from "@/services/auth-guard";

const NO_STORE = { "Cache-Control": "no-store" };

// Polling endpoint for the trainee's own conversation (never takes a
// conversation id). Handlers that read cookies are dynamic and, per the
// Next 16 docs, GET handlers are not cached by default; no-store keeps
// browsers and the service worker from keeping chat data either.
export const GET = async (request: NextRequest) => {
  const user = await getApiUser();

  if (!user) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }
  const params = request.nextUrl.searchParams;
  const query = parseHistoryQuery(params);

  if (!query.success) {
    return NextResponse.json(
      { error: "invalid_query" },
      { status: 400, headers: NO_STORE },
    );
  }
  const result = await loadTraineeThread(
    user,
    query.data,
    parseKnownState(params),
  );

  if (result.notModified) {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }
  return NextResponse.json(result.payload, { headers: NO_STORE });
};
