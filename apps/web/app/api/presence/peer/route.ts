import type { NextRequest } from "next/server";

import {
  actorOf,
  askApi,
  routeData,
  routeInvalid,
} from "@/features/chat/services/chat-api";

// The other side's last heartbeat as an ISO string (or null), so the thread
// header can refresh its status every minute even when no message changed.
// `serverNow` lets the client measure its clock skew: last-seen is stamped by
// the server, so "online" must be judged on the server's clock.
// Trainee: newest last-seen across the PTs who show it. `?as=admin&userId=N`:
// that trainee's last-seen; 404 when the admin may not open them.
export const GET = async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const actor = actorOf(request);
  const userId = Number(params.get("userId"));

  if (actor === "admin" && !(Number.isSafeInteger(userId) && userId > 0)) {
    return routeInvalid();
  }
  return routeData(
    await askApi(actor, (api) =>
      api.GET("/v1/presence/peer", {
        params: { query: actor === "admin" ? { userId } : {} },
      }),
    ),
  );
};
