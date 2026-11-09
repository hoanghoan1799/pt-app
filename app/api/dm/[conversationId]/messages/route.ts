import { type NextRequest, NextResponse } from "next/server";

import { resolveDmView } from "@/features/social/services/dm-access";
import { listDmThread } from "@/features/social/services/dm-queries";
import {
  actorOfAdmin,
  actorOfUser,
} from "@/features/social/services/post-context";
import { parseDmId } from "@/features/social/utils/dm-rules";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";

type Context = { params: Promise<{ conversationId: string }> };

const NO_STORE = { "Cache-Control": "no-store" };

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

const parseCursor = (value: string | null) =>
  value === null ? undefined : parseDmId(value);

// GET: the thread of one trainee conversation, polled every 5 s by the
// client. `?after=<id>` returns newer messages, `?before=<id>` older ones, no
// cursor the newest page. A trainee sees only their own conversations; a super
// admin asks with `?as=admin` and reads only. Everyone else gets 404, so ids
// reveal nothing.
export const GET = async (request: NextRequest, { params }: Context) => {
  const id = parseDmId((await params).conversationId);
  const search = request.nextUrl.searchParams;
  const after = parseCursor(search.get("after"));
  const before = parseCursor(search.get("before"));

  if (id === null || after === null || before === null) {
    return reply({ error: "not_found" }, 404);
  }
  if (after !== undefined && before !== undefined) {
    return reply({ error: "invalid_query" }, 400);
  }
  const isAdmin = search.get("as") === "admin";
  const viewer = isAdmin ? await getApiAdmin() : await getApiUser();

  if (!viewer) {
    return reply({ error: "unauthorized" }, 401);
  }
  const actor = isAdmin
    ? actorOfAdmin(viewer as Parameters<typeof actorOfAdmin>[0])
    : actorOfUser(viewer);
  const view = await resolveDmView(id, actor);

  if (!view) {
    return reply({ error: "not_found" }, 404);
  }
  const thread = await listDmThread(id, {
    after,
    before,
    otherId: view.otherId,
    viewer: actor,
  });

  return reply({
    ...thread,
    readOnlyReason: view.readOnlyReason,
    isReadOnly: view.access !== "member" || view.readOnlyReason !== null,
  });
};
