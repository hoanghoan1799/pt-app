import type { NextRequest } from "next/server";

import {
  actorOf,
  askApi,
  routeData,
  routeInvalid,
} from "@/features/chat/services/chat-api";
import { webizeUrlFields } from "@/features/chat/utils/api-urls";
import { threadQueryOf } from "@/features/chat/utils/chat-query";
import { parseRouteId } from "@/features/chat-groups/utils/group-ids";

// One page of a group's thread (`before` / `after`) plus the messages changed
// since `changedSince`, the group's switches and what the caller may do. The
// API checks membership on every request: a missing or dissolved group, a
// non-member and a left member all get 404. `?as=admin` picks the admin
// cookie (a browser can hold both).
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) => {
  const groupId = parseRouteId((await params).groupId);

  if (groupId === null) {
    return routeInvalid();
  }
  const { after, before, changedSince } = threadQueryOf(
    request.nextUrl.searchParams,
  );

  return routeData(
    await askApi(actorOf(request), (api) =>
      api.GET("/v1/chat/groups/{groupId}/messages", {
        params: {
          path: { groupId },
          query: { after, before, changedSince },
        },
      }),
    ),
    undefined,
    webizeUrlFields,
  );
};
