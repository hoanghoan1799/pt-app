import { NextResponse } from "next/server";

import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  countUnreadForUser,
  findConversationByUserId,
} from "@/features/chat/services/chat-queries";
import { getApiUser } from "@/services/auth-guard";

const NO_STORE = { "Cache-Control": "no-store" };

// Badge poll: unread count plus what decides whether the tab shows at all.
export const GET = async () => {
  const user = await getApiUser();

  if (!user) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }
  const [count, conversation] = await Promise.all([
    countUnreadForUser(user.id),
    findConversationByUserId(user.id),
  ]);

  return NextResponse.json(
    {
      count,
      chatEnabled: isChatEnabled(user),
      hasHistory: conversation?.lastMessageId != null,
    },
    { headers: NO_STORE },
  );
};
