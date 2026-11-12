"use server";

import { z } from "zod";

import { PRESENCE_MESSAGES } from "@/features/chat/constants/messages";
import { withResultErrorHandling } from "@/services/action-errors";
import { callApi } from "@/services/api/call";
import { requireAdmin } from "@/services/auth-guard";

const inputSchema = z.object({ isHidden: z.boolean() });

// "Trạng thái hoạt động" switch: hides the signed-in admin's online status
// from trainees (PUT /v1/admins/me/presence-hidden). Takes effect on the next
// presence refresh.
export const setPresenceHiddenAction = withResultErrorHandling(
  "setPresenceHidden",
  async (input: { isHidden: boolean }) => {
    await requireAdmin();
    const parsed = inputSchema.safeParse(input);

    if (!parsed.success) {
      return { status: "error" as const, message: PRESENCE_MESSAGES.INVALID };
    }
    await callApi("admin", (api) =>
      api.PUT("/v1/admins/me/presence-hidden", { body: parsed.data }),
    );
    return { status: "success" as const };
  },
);
