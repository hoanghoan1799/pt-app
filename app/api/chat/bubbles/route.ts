import { type NextRequest, NextResponse } from "next/server";

import { MAX_META_IDS } from "@/features/chat-bubbles/constants";
import {
  loadCoachBubble,
  loadTraineeBubbles,
  parseIdList,
} from "@/features/chat-bubbles/services/bubble-meta";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";

const NO_STORE = { "Cache-Control": "no-store" };

const unauthorized = () =>
  NextResponse.json(
    { error: "unauthorized" },
    { status: 401, headers: NO_STORE },
  );

// Name, photo and links of the chats the signed-in person keeps as bubbles.
// Trainee: their coach chat only. `?as=admin&ids=1,2` (admin cookie only): the
// listed trainees the admin may open; unknown, hidden and out-of-scope ids are
// simply missing from the answer.
export const GET = async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;

  if (params.get("as") === "admin") {
    const admin = await getApiAdmin();

    if (!admin) {
      return unauthorized();
    }
    const bubbles = await loadTraineeBubbles(
      admin.id,
      parseIdList(params.get("ids"), MAX_META_IDS),
    );

    return NextResponse.json({ bubbles }, { headers: NO_STORE });
  }
  const user = await getApiUser();

  if (!user) {
    return unauthorized();
  }
  return NextResponse.json(
    { bubbles: await loadCoachBubble(user) },
    { headers: NO_STORE },
  );
};
