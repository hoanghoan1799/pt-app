"use server";

import { z } from "zod";

import { AVATAR_MESSAGES } from "@/features/avatar/constants/messages";
import {
  AVATAR_MAX_DATA_URL_LENGTH,
  toWebAvatarUrl,
} from "@/features/avatar/utils/avatar-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { callApi } from "@/services/api/call";
import { requireAdmin, requireUser } from "@/services/auth-guard";

// Own photo only (KAN-157): the API takes the id from the session. The API
// checks the image bytes and size (AVATAR_INVALID / AVATAR_TOO_LARGE answer
// with the messages shown here). Results are
// `{ status: "success", avatarUrl } | { status: "error", message }`.

const inputSchema = z.object({
  dataUrl: z.string().min(1).max(AVATAR_MAX_DATA_URL_LENGTH),
});

const fail = (message: string) => ({ status: "error" as const, message });

// Refuses an oversized or empty request before forwarding it.
const parse = (input: unknown) => {
  const parsed = inputSchema.safeParse(input);

  return parsed.success
    ? parsed.data
    : fail(
        JSON.stringify(input ?? "").length > AVATAR_MAX_DATA_URL_LENGTH
          ? AVATAR_MESSAGES.TOO_LARGE
          : AVATAR_MESSAGES.INVALID,
      );
};

export const setUserAvatarAction = withResultErrorHandling(
  "setUserAvatar",
  async (input: { dataUrl: string }) => {
    await requireUser();
    const body = parse(input);

    if ("status" in body) {
      return body;
    }
    const { avatarUrl } = await callApi("user", (api) =>
      api.PUT("/v1/users/me/avatar", { body }),
    );

    return { status: "success" as const, avatarUrl: toWebAvatarUrl(avatarUrl) };
  },
);

export const removeUserAvatarAction = withResultErrorHandling(
  "removeUserAvatar",
  async () => {
    await requireUser();
    await callApi("user", (api) => api.DELETE("/v1/users/me/avatar"));
    return { status: "success" as const, avatarUrl: null };
  },
);

export const setAdminAvatarAction = withResultErrorHandling(
  "setAdminAvatar",
  async (input: { dataUrl: string }) => {
    await requireAdmin();
    const body = parse(input);

    if ("status" in body) {
      return body;
    }
    const { avatarUrl } = await callApi("admin", (api) =>
      api.PUT("/v1/admins/me/avatar", { body }),
    );

    return { status: "success" as const, avatarUrl: toWebAvatarUrl(avatarUrl) };
  },
);

export const removeAdminAvatarAction = withResultErrorHandling(
  "removeAdminAvatar",
  async () => {
    await requireAdmin();
    await callApi("admin", (api) => api.DELETE("/v1/admins/me/avatar"));
    return { status: "success" as const, avatarUrl: null };
  },
);
