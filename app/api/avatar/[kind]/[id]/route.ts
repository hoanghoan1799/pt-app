import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStoredAvatar } from "@/features/avatar/services/avatar";
import {
  type AvatarKind,
  decodeAvatarDataUrl,
  isAvatarKind,
} from "@/features/avatar/utils/avatar-rules";
import { findConversationByUserId } from "@/features/chat/services/chat-queries";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";

const idSchema = z.coerce.number().int().positive();

const json = (error: string, status: number) =>
  NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );

// Any admin sees every photo. A trainee sees their own, and the PT team's once
// they have a conversation (the shared inbox: every PT talks to them). Never
// another trainee's.
const canView = async (kind: AvatarKind, id: number) => {
  if (await getApiAdmin()) {
    return true;
  }
  const user = await getApiUser();

  if (!user) {
    return null;
  }
  if (kind === "user") {
    return user.id === id;
  }
  return (await findConversationByUserId(user.id)) !== null;
};

// The profile photo (KAN-157). Payloads carry `?v=<updatedAt>` URLs, not the
// image, so polling stays small. With a matching `v` the bytes never change
// and cache for a year; without it the browser revalidates by ETag.
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) => {
  const { kind, id: rawId } = await params;
  const id = idSchema.safeParse(rawId);

  if (!isAvatarKind(kind) || !id.success) {
    return json("not_found", 404);
  }
  const allowed = await canView(kind, id.data);

  if (allowed === null) {
    return json("unauthorized", 401);
  }
  // Same answer as a missing photo, so ids cannot be probed.
  const stored = allowed ? await getStoredAvatar(kind, id.data) : null;
  const decoded = stored ? decodeAvatarDataUrl(stored.avatar) : null;

  if (!stored || !decoded?.ok) {
    return json("not_found", 404);
  }
  const version = String(Math.floor(stored.updatedAt.getTime() / 1000));
  const etag = `"${version}"`;
  const isVersioned = request.nextUrl.searchParams.get("v") === version;
  const headers = {
    ETag: etag,
    "Cache-Control": isVersioned
      ? "private, max-age=31536000, immutable"
      : "private, no-cache",
    "X-Content-Type-Options": "nosniff",
  };

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(Buffer.from(decoded.bytes), {
    status: 200,
    headers: { ...headers, "Content-Type": decoded.mime },
  });
};
