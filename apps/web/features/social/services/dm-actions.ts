"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/constants/routes";
import { webizeUrls } from "@/features/chat/utils/api-urls";
import { DM_MESSAGES } from "@/features/social/constants/dm";
import type { DmMessageView } from "@/features/social/types/dm";
import { dmIdSchema, dmSendSchema } from "@/features/social/utils/dm-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import { requireUser } from "@/services/auth-guard";
import type { ActionErrorResult } from "@/types/error";

// Trainee chat actions: the session comes from the cookie, input is validated
// with Zod and the API decides everything else (members only, accepted terms,
// sending switched off). Realtime events and the read marks are the API's.

const fail = (message: string): ActionErrorResult => ({
  status: "error",
  message,
});

export type OpenDmResult =
  { status: "success"; conversationId: number } | ActionErrorResult;

// Opens an existing (read-only) conversation; new ones are never created.
export const openDmAction = withResultErrorHandling(
  "openDm",
  async (otherId: unknown): Promise<OpenDmResult> => {
    await requireUser();
    const id = dmIdSchema.safeParse(otherId);

    if (!id.success) {
      return fail(DM_MESSAGES.NOT_FOUND);
    }
    const outcome = await tryApi("user", (api) =>
      api.POST("/v1/dm/conversations", { body: { otherId: id.data } }),
    );

    return outcome.ok
      ? { status: "success", conversationId: outcome.data.conversationId }
      : fail(outcome.error.message);
  },
);

export type SendDmActionResult =
  { status: "success"; message: DmMessageView } | ActionErrorResult;

// Sending is switched off: the API answers 403 DM_DISABLED for a member, and
// its text is shown.
export const sendDmAction = withResultErrorHandling(
  "sendDm",
  async (input: unknown): Promise<SendDmActionResult> => {
    await requireUser();
    const parsed = dmSendSchema.safeParse(input);

    if (!parsed.success) {
      return fail(DM_MESSAGES.SEND_FAILED);
    }
    const { conversationId, ...body } = parsed.data;
    const outcome = await tryApi("user", (api) =>
      api.POST("/v1/dm/conversations/{cid}/messages", {
        params: { path: { cid: conversationId } },
        body,
      }),
    );

    if (!outcome.ok) {
      return fail(outcome.error.message);
    }
    revalidatePath(ROUTES.MESSAGES);
    return {
      status: "success",
      message: webizeUrls(outcome.data) as unknown as DmMessageView,
    };
  },
);

export const unsendDmAction = withResultErrorHandling(
  "unsendDm",
  async (conversationId: unknown, messageId: unknown) => {
    await requireUser();
    const ids = [
      dmIdSchema.safeParse(conversationId),
      dmIdSchema.safeParse(messageId),
    ];

    if (!ids[0].success || !ids[1].success) {
      return fail(DM_MESSAGES.NOT_FOUND);
    }
    const mid = ids[1].data;
    const outcome = await tryApi("user", (api) =>
      api.DELETE("/v1/dm/messages/{mid}", { params: { path: { mid } } }),
    );

    if (!outcome.ok) {
      return fail(outcome.error.message);
    }
    revalidatePath(ROUTES.MESSAGES);
  },
);

export const markDmReadAction = withResultErrorHandling(
  "markDmRead",
  async (conversationId: unknown) => {
    await requireUser();
    const id = dmIdSchema.safeParse(conversationId);

    if (!id.success) {
      return fail(DM_MESSAGES.NOT_FOUND);
    }
    const outcome = await tryApi("user", (api) =>
      api.POST("/v1/dm/conversations/{cid}/read", {
        params: { path: { cid: id.data } },
        body: {} as never,
      }),
    );

    if (!outcome.ok) {
      return fail(DM_MESSAGES.NOT_FOUND);
    }
  },
);
