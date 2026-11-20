import type { NextRequest } from "next/server";

import { proxyChatFile } from "@/features/chat/services/chat-api";
import { parseRouteId } from "@/features/chat-groups/utils/group-ids";

// GET: one photo of a group message. The API serves it to members only (a
// hidden message's photo to managers only) and answers 404 for everything
// else; the bytes of an id never change, so a private cache may keep them.
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; photoId: string }> },
) => {
  const raw = await params;
  const groupId = parseRouteId(raw.groupId);
  const photoId = parseRouteId(raw.photoId);

  return groupId === null || photoId === null
    ? Response.json({ error: "not_found" }, { status: 404 })
    : proxyChatFile(request, `/v1/chat/groups/${groupId}/photos/${photoId}`);
};
