import type { NextRequest } from "next/server";

import { proxyChatFile } from "@/features/chat/services/chat-api";
import { parsePhotoId } from "@/features/chat/utils/photo-rules";

type Context = { params: Promise<{ id: string }> };

// GET: the photo. The API answers 404 for anyone who is not the trainee of its
// conversation or an admin who can access that trainee (never 403, so ids
// reveal nothing). The bytes of an id never change, so a private cache may
// keep them.
export const GET = async (request: NextRequest, { params }: Context) => {
  const id = parsePhotoId((await params).id);

  return id === null
    ? Response.json({ error: "not_found" }, { status: 404 })
    : proxyChatFile(request, `/v1/chat/photos/${id}`);
};
