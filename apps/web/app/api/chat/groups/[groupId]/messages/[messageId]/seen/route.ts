import type { NextRequest } from "next/server";

import {
  actorOf,
  askApi,
  routeData,
  routeInvalid,
} from "@/features/chat/services/chat-api";
import { parseRouteId } from "@/features/chat-groups/utils/group-ids";

// "Seen by N": the members other than the sender whose read cursor is at or
// past the message, with their role. 404 for a non-member.
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
      api.GET("/v1/chat/groups/{groupId}/messages/{mid}/seen", {
        params: { path: { groupId, mid } },
      }),
    ),
  );
};
