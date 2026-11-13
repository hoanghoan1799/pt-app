import type { NextRequest } from "next/server";

import { actorOf, askApi, routeData } from "@/features/chat/services/chat-api";

// GIPHY search and trending for the sticker picker (KAN-144), through the API
// (it keeps the key, the cache and the rate limit). Without a key the answer
// is 200 { enabled: false, stickers: [] } so the client hides the tab.
// `?q=` empty means trending. A trainee with chat locked gets 403.
export const GET = async (request: NextRequest) =>
  routeData(
    await askApi(actorOf(request), (api) =>
      api.GET("/v1/chat/stickers/giphy", {
        params: {
          query: { q: request.nextUrl.searchParams.get("q") ?? undefined },
        },
      }),
    ),
  );
