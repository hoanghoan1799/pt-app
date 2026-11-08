import { type NextRequest, NextResponse } from "next/server";

import { parsePhotoId } from "@/features/chat/utils/photo-rules";
import {
  actorOfAdmin,
  actorOfUser,
} from "@/features/social/services/post-context";
import { findPostPhotoForViewer } from "@/features/social/services/post-photos";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";

type Context = { params: Promise<{ id: string }> };

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// GET: the photo of a post. 404 unless the post is visible to the signed-in
// viewer (canSeePost), never 403, so ids reveal nothing. The bytes of an id
// never change, but visibility can, so only a short private cache.
export const GET = async (_request: NextRequest, { params }: Context) => {
  const id = parsePhotoId((await params).id);

  if (id === null) {
    return reply({ error: "not_found" }, 404);
  }
  const [admin, user] = await Promise.all([getApiAdmin(), getApiUser()]);

  if (!admin && !user) {
    return reply({ error: "unauthorized" }, 401);
  }
  const viewers = [
    ...(admin ? [actorOfAdmin(admin)] : []),
    ...(user ? [actorOfUser(user)] : []),
  ];

  for (const viewer of viewers) {
    const found = await findPostPhotoForViewer(id, viewer);

    if (found) {
      return new NextResponse(new Uint8Array(found.data), {
        status: 200,
        headers: {
          "Content-Type": found.mime,
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }
  }
  return reply({ error: "not_found" }, 404);
};
