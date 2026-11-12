import type { NextRequest } from "next/server";

import { proxyChatFile } from "@/features/chat/services/chat-api";
import { parsePhotoId } from "@/features/chat/utils/photo-rules";

type Context = { params: Promise<{ id: string }> };

// GET: the photo of a trainee chat message. The API answers 404 unless the
// viewer is one of the two members (and the chat is not hidden by a block) or a
// super admin; never 403, so ids reveal nothing. A PT never gets it.
export const GET = async (request: NextRequest, { params }: Context) => {
  const id = parsePhotoId((await params).id);

  return id === null
    ? Response.json({ error: "not_found" }, { status: 404 })
    : proxyChatFile(request, `/v1/dm/photos/${id}`);
};
