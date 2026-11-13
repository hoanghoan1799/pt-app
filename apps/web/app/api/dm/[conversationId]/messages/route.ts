import { type NextRequest, NextResponse } from "next/server";

import {
  actorOf,
  askApi,
  routeData,
  routeInvalid,
} from "@/features/chat/services/chat-api";
import { parseDmId } from "@/features/social/utils/dm-rules";

type Context = { params: Promise<{ conversationId: string }> };

const parseCursor = (value: string | null) =>
  value === null ? undefined : parseDmId(value);

// GET: the thread of one trainee conversation, polled every 5 s by the
// client. `?after=<id>` returns newer messages, `?before=<id>` older ones, no
// cursor the newest page. A trainee sees only their own conversations; a super
// admin asks with `?as=admin` and reads only. The API answers 404 to everyone
// else, so ids reveal nothing.
export const GET = async (request: NextRequest, { params }: Context) => {
  const id = parseDmId((await params).conversationId);
  const search = request.nextUrl.searchParams;
  const after = parseCursor(search.get("after"));
  const before = parseCursor(search.get("before"));

  if (id === null || after === null || before === null) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (after !== undefined && before !== undefined) {
    return routeInvalid();
  }
  return routeData(
    await askApi(actorOf(request), (api) =>
      api.GET("/v1/dm/conversations/{cid}/messages", {
        params: { path: { cid: id }, query: { after, before } },
      }),
    ),
  );
};
