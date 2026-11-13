import type { NextRequest } from "next/server";

import {
  actorOf,
  askApi,
  routeError,
  routeNoContent,
} from "@/features/chat/services/chat-api";

// Presence heartbeat (KAN-128). The client posts about once a minute while
// the app is visible. `?as=admin` uses the admin session, otherwise the
// trainee's. The API stamps last-seen (at most one write a minute per person)
// and slides an unlocked admin's window (KAN-160). 204 on success, 401 when
// not signed in.
export const POST = async (request: NextRequest) => {
  const asked = await askApi(actorOf(request), (api) =>
    api.POST("/v1/presence/heartbeat"),
  );

  return asked.ok ? routeNoContent() : routeError(asked.error);
};
