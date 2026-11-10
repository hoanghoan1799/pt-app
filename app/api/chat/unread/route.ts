import { type NextRequest, NextResponse } from "next/server";

import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  countUnreadForUser,
  findConversationByUserId,
  findLatestLoudIncomingForUser,
  listUnreadByTraineeForAdmin,
} from "@/features/chat/services/chat-queries";
import { countDmUnread } from "@/features/social/services/dm-queries";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";

const NO_STORE = { "Cache-Control": "no-store" };

const unauthorized = () =>
  NextResponse.json(
    { error: "unauthorized" },
    { status: 401, headers: NO_STORE },
  );

// Badge poll. Trainee: unread count plus what decides whether the tab shows
// at all. `?as=admin` (admin cookie only, a trainee session never gets it):
// the admin's unread total and the count per trainee. A browser may hold both
// cookies, so the admin view is only served when asked for.
export const GET = async (request: NextRequest) => {
  if (request.nextUrl.searchParams.get("as") === "admin") {
    const admin = await getApiAdmin();

    if (!admin) {
      return unauthorized();
    }
    const perTrainee = await listUnreadByTraineeForAdmin(admin.id);

    return NextResponse.json(
      {
        count: perTrainee.reduce((total, row) => total + row.unread, 0),
        perTrainee,
      },
      { headers: NO_STORE },
    );
  }
  const user = await getApiUser();

  if (!user) {
    return unauthorized();
  }
  const [coachCount, conversation, dmCount, latestLoudIncomingId] =
    await Promise.all([
      countUnreadForUser(user.id),
      findConversationByUserId(user.id),
      countDmUnread(user.id),
      findLatestLoudIncomingForUser(user.id),
    ]);
  // The Messages tab badge covers the coach chat and the friend chats.
  const count = coachCount + dmCount;

  return NextResponse.json(
    {
      count,
      coachCount,
      dmCount,
      chatEnabled: isChatEnabled(user),
      hasHistory: conversation?.lastMessageId != null,
      latestLoudIncomingId,
    },
    { headers: NO_STORE },
  );
};
