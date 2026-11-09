"use server";

import { z } from "zod";

import { AVATAR_MESSAGES } from "@/features/avatar/constants/messages";
import { clearAvatar, saveAvatar } from "@/features/avatar/services/avatar";
import {
  AVATAR_MAX_DATA_URL_LENGTH,
  type AvatarKind,
  decodeAvatarDataUrl,
} from "@/features/avatar/utils/avatar-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { requireAdmin, requireUser } from "@/services/auth-guard";

// Own photo only (KAN-157): the id always comes from the session. Results are
// `{ status: "success", avatarUrl } | { status: "error", message }`.

const inputSchema = z.object({
  dataUrl: z.string().min(1).max(AVATAR_MAX_DATA_URL_LENGTH),
});

const fail = (message: string) => ({ status: "error" as const, message });

const store = async (kind: AvatarKind, id: number, input: unknown) => {
  const parsed = inputSchema.safeParse(input);

  if (!parsed.success) {
    return fail(
      JSON.stringify(input ?? "").length > AVATAR_MAX_DATA_URL_LENGTH
        ? AVATAR_MESSAGES.TOO_LARGE
        : AVATAR_MESSAGES.INVALID,
    );
  }
  const decoded = decodeAvatarDataUrl(parsed.data.dataUrl);

  if (!decoded.ok) {
    return fail(
      decoded.reason === "too-large"
        ? AVATAR_MESSAGES.TOO_LARGE
        : AVATAR_MESSAGES.INVALID,
    );
  }
  return {
    status: "success" as const,
    avatarUrl: await saveAvatar(kind, id, parsed.data.dataUrl),
  };
};

export const setUserAvatarAction = withResultErrorHandling(
  "setUserAvatar",
  async (input: { dataUrl: string }) => {
    const user = await requireUser();

    return store("user", user.id, input);
  },
);

export const removeUserAvatarAction = withResultErrorHandling(
  "removeUserAvatar",
  async () => {
    const user = await requireUser();

    await clearAvatar("user", user.id);
    return { status: "success" as const, avatarUrl: null };
  },
);

export const setAdminAvatarAction = withResultErrorHandling(
  "setAdminAvatar",
  async (input: { dataUrl: string }) => {
    const admin = await requireAdmin();

    return store("admin", admin.id, input);
  },
);

export const removeAdminAvatarAction = withResultErrorHandling(
  "removeAdminAvatar",
  async () => {
    const admin = await requireAdmin();

    await clearAvatar("admin", admin.id);
    return { status: "success" as const, avatarUrl: null };
  },
);
