import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getAdminTeamLastSeen,
  getUserLastSeen,
} from "@/features/chat/services/presence";
import { serializeLastSeen } from "@/features/chat/utils/presence";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";
import { findUserById } from "@/services/users";

const NO_STORE = { "Cache-Control": "no-store" };

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

const userIdSchema = z.coerce.number().int().positive();

// The other side's last heartbeat as an ISO string (or null), so the thread
// header can refresh its status every minute even when no message changed.
// `serverNow` lets the client measure its clock skew: last-seen is stamped
// by the server, so "online" must be judged on the server's clock.
// Trainee: newest last-seen across all PTs. `?as=admin&userId=N`: that
// trainee's last-seen; 404 when the user does not exist.
export const GET = async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;

  if (params.get("as") === "admin") {
    const admin = await getApiAdmin();

    if (!admin) {
      return reply({ error: "unauthorized" }, 401);
    }
    const userId = userIdSchema.safeParse(params.get("userId"));

    if (!userId.success) {
      return reply({ error: "invalid_query" }, 400);
    }
    const trainee = await findUserById(userId.data);

    if (!trainee || !(await canAdminAccessUser(admin.id, trainee.id))) {
      return reply({ error: "not_found" }, 404);
    }
    return reply({
      peerLastSeenAt: serializeLastSeen(await getUserLastSeen(trainee.id)),
      serverNow: new Date().toISOString(),
    });
  }
  const user = await getApiUser();

  if (!user) {
    return reply({ error: "unauthorized" }, 401);
  }
  return reply({
    peerLastSeenAt: serializeLastSeen(await getAdminTeamLastSeen()),
    serverNow: new Date().toISOString(),
  });
};
