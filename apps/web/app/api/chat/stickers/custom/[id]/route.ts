import { type NextRequest, NextResponse } from "next/server";

import {
  actorOf,
  askApi,
  isSameOrigin,
  proxyChatFile,
  routeError,
} from "@/features/chat/services/chat-api";
import { parseCustomStickerId } from "@/features/chat/utils/custom-sticker-rules";

type Context = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "no-store" };

// GET: the picture. 404 for anyone who is neither the owner nor on the other
// side of a conversation it was sent in (never 403, so ids reveal nothing).
// The bytes of an id never change, so a private cache may keep them.
export const GET = async (request: NextRequest, { params }: Context) => {
  const id = parseCustomStickerId((await params).id);

  return id === null
    ? NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: NO_STORE },
      )
    : proxyChatFile(request, `/v1/chat/stickers/custom/${id}`);
};

// DELETE: remove one of my own stickers.
export const DELETE = async (request: NextRequest, { params }: Context) => {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: NO_STORE },
    );
  }
  const id = parseCustomStickerId((await params).id);

  if (id === null) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  const asked = await askApi(actorOf(request), (api) =>
    api.DELETE("/v1/chat/stickers/custom/{id}", {
      params: { path: { id } },
    }),
  );

  return asked.ok
    ? NextResponse.json({ ok: true }, { headers: NO_STORE })
    : routeError(asked.error);
};
