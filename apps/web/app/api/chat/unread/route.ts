import type { NextRequest } from "next/server";

import { actorOf, askApi, routeData } from "@/features/chat/services/chat-api";

// Badge poll. Trainee: unread count plus what decides whether the tab shows
// at all. `?as=admin` (admin cookie only, a trainee session never gets it):
// the admin's unread total and the count per trainee. A browser may hold both
// cookies, so the admin view is only served when asked for. The trainee's
// count covers the coach chat and the friend chats.
export const GET = async (request: NextRequest) =>
  routeData(
    await askApi(actorOf(request), (api) => api.GET("/v1/chat/unread")),
  );
