import type { NextRequest } from "next/server";

import {
  actorOf,
  askApi,
  routeData,
  routeError,
} from "@/features/chat/services/chat-api";
import { EMPTY_GROUP_UNREAD } from "@/features/chat-groups/services/group-queries";

// Badge poll. Trainee: unread count plus what decides whether the tab shows
// at all. `?as=admin` (admin cookie only, a trainee session never gets it):
// the admin's unread total and the count per trainee. A browser may hold both
// cookies, so the admin view is only served when asked for. The trainee's
// count covers the coach chat and the friend chats; `groups` (total and per
// group, from GET /v1/chat/groups/unread) sits next to it, and the badges add
// it. A group answer that fails counts as no group unread.
export const GET = async (request: NextRequest) => {
  const actor = actorOf(request);
  const [chat, groups] = await Promise.all([
    askApi(actor, (api) => api.GET("/v1/chat/unread")),
    askApi(actor, (api) => api.GET("/v1/chat/groups/unread")),
  ]);

  if (!chat.ok) {
    return routeError(chat.error);
  }
  return routeData({
    ...chat,
    data: {
      ...chat.data,
      groups: groups.ok ? groups.data : EMPTY_GROUP_UNREAD,
    },
  });
};
