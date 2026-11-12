import { type NextRequest, NextResponse } from "next/server";

import { parsePhotoId } from "@/features/chat/utils/photo-rules";
import { proxyApiFile } from "@/services/api/binary";
import { ApiError } from "@/services/api/errors";
import { readSessionToken } from "@/services/session";

type Context = { params: Promise<{ id: string }> };

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// GET: the photo of a post, streamed from the API. The API answers 404 unless
// the post is visible to the signed-in viewer, never 403, so ids reveal
// nothing. Whoever is signed in may ask: the admin session first, then the
// trainee's.
export const GET = async (request: NextRequest, { params }: Context) => {
  const id = parsePhotoId((await params).id);

  if (id === null) {
    return reply({ error: "not_found" }, 404);
  }
  const actors = ["admin", "user"] as const;
  let signedIn = false;

  for (const actor of actors) {
    if (!(await readSessionToken(actor))) {
      continue;
    }
    signedIn = true;
    try {
      return await proxyApiFile(actor, `/v1/social/photos/${id}`, { request });
    } catch (error) {
      if (!(error instanceof ApiError) || !error.isClientError) {
        throw error;
      }
    }
  }
  return signedIn
    ? reply({ error: "not_found" }, 404)
    : reply({ error: "unauthorized" }, 401);
};
