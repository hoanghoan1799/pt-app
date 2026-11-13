import { type NextRequest, NextResponse } from "next/server";

import { routeError } from "@/features/chat/services/chat-api";
import { MAX_META_IDS } from "@/features/chat-bubbles/constants";
import {
  loadCoachBubble,
  loadTraineeBubbles,
  parseIdList,
} from "@/features/chat-bubbles/services/bubble-meta";

const NO_STORE = { "Cache-Control": "no-store" };

// Name, photo and links of the chats the signed-in person keeps as bubbles.
// Trainee: their coach chat only. `?as=admin&ids=1,2` (admin cookie only): the
// listed trainees the admin may open; unknown, hidden and out-of-scope ids are
// simply missing from the answer.
export const GET = async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const asked =
    params.get("as") === "admin"
      ? await loadTraineeBubbles(parseIdList(params.get("ids"), MAX_META_IDS))
      : await loadCoachBubble();

  return asked.ok
    ? NextResponse.json({ bubbles: asked.data }, { headers: NO_STORE })
    : routeError(asked.error);
};
