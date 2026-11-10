import { type NextRequest, NextResponse } from "next/server";

import { parsePhotoId } from "@/features/chat/utils/photo-rules";
import { findDmPhotoForViewer } from "@/features/social/services/dm-photos";
import {
  actorOfAdmin,
  actorOfUser,
} from "@/features/social/services/post-context";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";

type Context = { params: Promise<{ id: string }> };

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// GET: the photo of a trainee chat message. 404 unless the viewer is one of
// the two members (and the chat is not hidden by a block) or a super admin;
// never 403, so ids reveal nothing. A PT never gets it.
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
    ...(user ? [actorOfUser(user)] : []),
    ...(admin ? [actorOfAdmin(admin)] : []),
  ];

  for (const viewer of viewers) {
    const found = await findDmPhotoForViewer(id, viewer);

    if (found) {
      return new NextResponse(new Uint8Array(found.data), {
        status: 200,
        headers: {
          "Content-Type": found.mime,
          "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }
  }
  return reply({ error: "not_found" }, 404);
};
