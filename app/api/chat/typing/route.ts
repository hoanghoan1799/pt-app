import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  findConversationById,
  findConversationByUserId,
} from "@/features/chat/services/chat-queries";
import { publishTyping } from "@/features/chat/services/chat-realtime";
import {
  adminClientId,
  traineeClientId,
} from "@/features/chat/utils/ably-capabilities";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";
import { canAdminAccessUser } from "@/services/hidden-users";
import { findUserById } from "@/services/users";

const NO_STORE = { "Cache-Control": "no-store" };

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// Admin names the conversation; a trainee never does (own conversation only).
const adminBodySchema = z.object({
  conversationId: z.number().int().positive(),
});

// Publishes a "typing" event on the caller's behalf. Browsers stay
// subscribe-only on Ably, so nobody can forge message events. Fire and forget:
// 204 whenever the request is valid, also when Ably is not configured (polling
// mode) or the publish fails. A locked conversation answers 403 and sends
// nothing. `?as=admin` uses the admin session, otherwise the trainee's.
export const POST = async (request: NextRequest) => {
  if (request.nextUrl.searchParams.get("as") === "admin") {
    const admin = await getApiAdmin();

    if (!admin) {
      return reply({ error: "unauthorized" }, 401);
    }
    const parsed = adminBodySchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!parsed.success) {
      return reply({ error: "invalid_body" }, 400);
    }
    const conversation = await findConversationById(parsed.data.conversationId);

    if (!conversation) {
      return reply({ error: "not_found" }, 404);
    }
    if (!(await canAdminAccessUser(admin.id, conversation.userId))) {
      return reply({ error: "not_found" }, 404);
    }
    const trainee = await findUserById(conversation.userId);

    if (!trainee || !isChatEnabled(trainee)) {
      return reply({ error: "chat_locked" }, 403);
    }
    await publishTyping(conversation.id, "admin", adminClientId(admin.id));
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }
  const user = await getApiUser();

  if (!user) {
    return reply({ error: "unauthorized" }, 401);
  }
  if (!isChatEnabled(user)) {
    return reply({ error: "chat_locked" }, 403);
  }
  const conversation = await findConversationByUserId(user.id);

  // No conversation yet means nobody is listening.
  if (conversation) {
    await publishTyping(conversation.id, "user", traineeClientId(user.id));
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE });
};
