import type { NextRequest } from "next/server";

import { askApi, routeData } from "@/features/chat/services/chat-api";
import { threadQueryOf } from "@/features/chat/utils/chat-query";

// Polling endpoint for the trainee's own conversation (never takes a
// conversation id). The API answers 204 when nothing changed since the
// cursors the client sends (`after`, `readUpTo`, `enabled`, `changedSince`).
// no-store keeps browsers and the service worker from keeping chat data.
export const GET = async (request: NextRequest) =>
  routeData(
    await askApi("user", (api) =>
      api.GET("/v1/chat/conversations/me/messages", {
        params: { query: threadQueryOf(request.nextUrl.searchParams) },
      }),
    ),
  );
