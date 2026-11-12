import type { NextRequest } from "next/server";

import {
  actorOf,
  askApi,
  routeData,
  routeError,
} from "@/features/chat/services/chat-api";
import { getPublicApiUrl } from "@/services/env";

// A one-time ticket (60 s) for the Socket.IO handshake. The browser connects
// straight to the API with `auth: { ticket }`, so the long-lived session token
// never reaches page JavaScript. POST, because a ticket is used once.
// `?as=admin` asks with the admin session, otherwise the trainee's. A locked
// admin gets 403 and keeps polling.
export const POST = async (request: NextRequest) => {
  const asked = await askApi(actorOf(request), (api) =>
    api.POST("/v1/realtime/ticket"),
  );

  if (!asked.ok) {
    return routeError(asked.error);
  }
  return routeData({
    ...asked,
    data: { ...asked.data, url: getPublicApiUrl() },
  });
};
