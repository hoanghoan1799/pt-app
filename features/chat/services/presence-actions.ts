"use server";

import { z } from "zod";

import { setAdminPresenceHidden } from "@/features/chat/services/presence";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdmin } from "@/services/auth-guard";

const INVALID_MESSAGE = "Giá trị không hợp lệ";

const inputSchema = z.object({ isHidden: z.boolean() });

// "Trạng thái hoạt động" switch: hides the signed-in admin's online status
// from trainees. Takes effect on the next presence refresh.
export const setPresenceHiddenAction = withResultErrorHandling(
  "setPresenceHidden",
  async (input: { isHidden: boolean }) => {
    const admin = await requireAdmin();
    const parsed = inputSchema.safeParse(input);

    if (!parsed.success) {
      return { status: "error" as const, message: INVALID_MESSAGE };
    }
    await setAdminPresenceHidden(admin.id, parsed.data.isHidden);
    return { status: "success" as const };
  },
);
