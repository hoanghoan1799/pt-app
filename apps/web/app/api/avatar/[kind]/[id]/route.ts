import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAvatarKind } from "@/features/avatar/utils/avatar-rules";
import { proxyApiFile } from "@/services/api/binary";
import { ApiError } from "@/services/api/errors";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";

const idSchema = z.coerce.number().int().positive();

const json = (error: string, status: number) =>
  NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );

// The profile photo (KAN-157). Payloads carry `?v=<version>` URLs, not the
// image, so polling stays small. The API decides who may see which photo (any
// admin every photo; a trainee their own and the PT team's once they have a
// conversation), answers 404 for everything else, and sets the ETag and the
// year-long cache for a matching `v`; this route only picks whose session to
// send and relays the bytes.
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) => {
  const { kind, id: rawId } = await params;
  const id = idSchema.safeParse(rawId);

  if (!isAvatarKind(kind) || !id.success) {
    return json("not_found", 404);
  }
  const actor = (await getApiAdmin())
    ? "admin"
    : (await getApiUser()) && "user";

  if (!actor) {
    return json("unauthorized", 401);
  }
  const version = request.nextUrl.searchParams.get("v");
  const query = version ? `?v=${encodeURIComponent(version)}` : "";

  try {
    return await proxyApiFile(actor, `/v1/avatars/${kind}/${id.data}${query}`, {
      request,
    });
  } catch (error) {
    // Same answer as a missing photo, so ids cannot be probed.
    if (error instanceof ApiError && error.isClientError) {
      return json("not_found", 404);
    }
    throw error;
  }
};
