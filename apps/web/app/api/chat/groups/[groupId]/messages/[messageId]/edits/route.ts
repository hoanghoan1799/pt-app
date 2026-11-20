import type { NextRequest } from "next/server";

import {
  actorOf,
  askApi,
  routeData,
  routeInvalid,
} from "@/features/chat/services/chat-api";
import { webizeUrlFields } from "@/features/chat/utils/api-urls";
import { parseRouteId } from "@/features/chat-groups/utils/group-ids";

// Previous bodies of an edited group message; every member sees them. The
// API answers 404 for a non-member or a message of another group.
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; messageId: string }> },
) => {
  const raw = await params;
  const groupId = parseRouteId(raw.groupId);
  const mid = parseRouteId(raw.messageId);

  if (groupId === null || mid === null) {
    return routeInvalid();
  }
  return routeData(
    await askApi(actorOf(request), (api) =>
      api.GET("/v1/chat/groups/{groupId}/messages/{mid}/edits", {
        params: { path: { groupId, mid } },
      }),
    ),
    undefined,
    webizeUrlFields,
  );
};
