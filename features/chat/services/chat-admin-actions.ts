"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import { setChatEnabled } from "@/features/chat/services/chat-permission";
import { findConversationByUserId } from "@/features/chat/services/chat-queries";
import { publishChatStatus } from "@/features/chat/services/chat-realtime";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdmin } from "@/services/auth-guard";

const inputSchema = z.object({
  userId: z.number().int().positive(),
  enabled: z.boolean(),
});

// Admin switch: lock or unlock chat for one trainee (S1).
export const setChatEnabledAction = withResultErrorHandling(
  "setChatEnabled",
  async (userId: number, enabled: boolean) => {
    const admin = await requireAdmin();
    const input = inputSchema.parse({ userId, enabled });
    const { updated } = await setChatEnabled(
      input.userId,
      input.enabled,
      admin.id,
    );

    if (!updated) {
      return {
        status: "error" as const,
        message: CHAT_MESSAGES.USER_NOT_FOUND,
      };
    }

    // The switch is already saved: a failed lookup only skips the
    // conversation channel, it never fails the action.
    const conversation = await findConversationByUserId(input.userId).catch(
      () => null,
    );

    await publishChatStatus(
      input.userId,
      conversation?.id ?? null,
      input.enabled,
    );
    revalidatePath(`${ROUTES.ADMIN_USERS}/${input.userId}`);
  },
);
