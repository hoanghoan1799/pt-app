import type { NextRequest } from "next/server";

import { proxyChatFile } from "@/features/chat/services/chat-api";
import { parseRouteId } from "@/features/chat-groups/utils/group-ids";

// GET: the group photo. Payloads carry the API's signed `?v=<version>&t=<token>`
// URL; the token (or membership) is what the API checks, and it answers 404
// for everything else. This route only relays the two parameters and the bytes.
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) => {
  const groupId = parseRouteId((await params).groupId);

  if (groupId === null) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const forwarded = new URLSearchParams();

  for (const name of ["v", "t"]) {
    const value = request.nextUrl.searchParams.get(name);

    if (value) {
      forwarded.set(name, value);
    }
  }
  const query = forwarded.size > 0 ? `?${forwarded}` : "";

  return proxyChatFile(request, `/v1/chat/groups/${groupId}/avatar${query}`);
};
