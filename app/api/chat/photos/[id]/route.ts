import { type NextRequest, NextResponse } from "next/server";

import {
  findPhotoForViewer,
  type PhotoViewer,
} from "@/features/chat/services/chat-photos";
import { parsePhotoId } from "@/features/chat/utils/photo-rules";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";

type Context = { params: Promise<{ id: string }> };

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// GET: the photo. 404 for anyone who is not the trainee of its conversation or
// an admin who can access that trainee (never 403, so ids reveal nothing).
// The bytes of an id never change, so a private cache may keep them.
export const GET = async (_request: NextRequest, { params }: Context) => {
  const id = parsePhotoId((await params).id);

  if (id === null) {
    return reply({ error: "not_found" }, 404);
  }
  const [admin, user] = await Promise.all([getApiAdmin(), getApiUser()]);

  if (!admin && !user) {
    return reply({ error: "unauthorized" }, 401);
  }
  const viewers: PhotoViewer[] = [
    ...(admin ? [{ kind: "admin" as const, id: admin.id }] : []),
    ...(user ? [{ kind: "user" as const, id: user.id }] : []),
  ];

  for (const viewer of viewers) {
    const found = await findPhotoForViewer(id, viewer);

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
