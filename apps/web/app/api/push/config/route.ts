import type { NextRequest } from "next/server";

import { actorOf, askApi, routeData } from "@/features/chat/services/chat-api";

// Is web push on, and the VAPID public key to subscribe with (from the API,
// so the web app needs no key of its own). Signed-in only.
export const GET = async (request: NextRequest) =>
  routeData(
    await askApi(actorOf(request), (api) => api.GET("/v1/push/config")),
  );
