"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/constants/routes";
import { DM_MESSAGES } from "@/features/social/constants/dm";
import { SOCIAL_MESSAGES } from "@/features/social/constants/social";
import { traineeActor } from "@/features/social/services/actor-guard";
import { resolveDmView } from "@/features/social/services/dm-access";
import {
  type DmError,
  getOrCreateDmConversation,
  markDmConversationRead,
  sendDmMessage,
  unsendDmMessage,
} from "@/features/social/services/dm-mutations";
import {
  publishDmEvent,
  scheduleDmPush,
} from "@/features/social/services/dm-notify";
import type { DmMessageView } from "@/features/social/types/dm";
import { dmIdSchema, dmSendSchema } from "@/features/social/utils/dm-rules";
import { withResultErrorHandling } from "@/services/action-errors";
import type { ActionErrorResult } from "@/types/error";

// Trainee chat actions: the actor comes from the session (accepted terms
// required), input is validated with Zod and the services re-check access.

const fail = (message: string): ActionErrorResult => ({
  status: "error",
  message,
});

const MESSAGES: Record<DmError, string> = {
  not_found: DM_MESSAGES.NOT_FOUND,
  read_only: DM_MESSAGES.READ_ONLY,
  empty: DM_MESSAGES.EMPTY,
  too_long: DM_MESSAGES.TOO_LONG,
  photo_not_found: DM_MESSAGES.PHOTO_NOT_FOUND,
  post_not_found: DM_MESSAGES.POST_NOT_FOUND,
};

export type OpenDmResult =
  { status: "success"; conversationId: number } | ActionErrorResult;

// "Nhắn tin" on a friend: get or create the conversation.
export const openDmAction = withResultErrorHandling(
  "openDm",
  async (otherId: unknown): Promise<OpenDmResult> => {
    const actor = await traineeActor();

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const id = dmIdSchema.safeParse(otherId);

    if (!id.success) {
      return fail(DM_MESSAGES.NOT_FOUND);
    }
    const result = await getOrCreateDmConversation(actor.id, id.data);

    return result.ok
      ? { status: "success", conversationId: result.conversationId }
      : fail(MESSAGES[result.error]);
  },
);

export type SendDmActionResult =
  { status: "success"; message: DmMessageView } | ActionErrorResult;

export const sendDmAction = withResultErrorHandling(
  "sendDm",
  async (input: unknown): Promise<SendDmActionResult> => {
    const actor = await traineeActor();

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const parsed = dmSendSchema.safeParse(input);

    if (!parsed.success) {
      return fail(DM_MESSAGES.SEND_FAILED);
    }
    const result = await sendDmMessage({
      conversationId: parsed.data.conversationId,
      senderId: actor.id,
      clientId: parsed.data.clientId,
      body: parsed.data.body,
      photoId: parsed.data.photoId,
      postId: parsed.data.postId,
    });

    if (!result.ok) {
      return fail(result.message ?? MESSAGES[result.error]);
    }
    if (result.created) {
      await publishDmEvent(
        "MESSAGE",
        parsed.data.conversationId,
        result.message.id,
        actor.id,
      );
      scheduleDmPush({
        senderId: actor.id,
        recipientId: result.recipientId,
        conversationId: parsed.data.conversationId,
        photo: result.message.photo !== null,
      });
      revalidatePath(ROUTES.MESSAGES);
    }
    return { status: "success", message: result.message };
  },
);

export const unsendDmAction = withResultErrorHandling(
  "unsendDm",
  async (conversationId: unknown, messageId: unknown) => {
    const actor = await traineeActor();

    if (!actor) {
      return fail(SOCIAL_MESSAGES.TERMS_REQUIRED);
    }
    const ids = [
      dmIdSchema.safeParse(conversationId),
      dmIdSchema.safeParse(messageId),
    ];

    if (!ids[0].success || !ids[1].success) {
      return fail(DM_MESSAGES.NOT_FOUND);
    }
    const result = await unsendDmMessage(ids[0].data, ids[1].data, actor.id);

    if (!result.ok) {
      return fail(MESSAGES[result.error]);
    }
    await publishDmEvent("UPDATE", ids[0].data, ids[1].data, actor.id);
    revalidatePath(ROUTES.MESSAGES);
  },
);

export const markDmReadAction = withResultErrorHandling(
  "markDmRead",
  async (conversationId: unknown) => {
    const actor = await traineeActor();
    const id = dmIdSchema.safeParse(conversationId);

    if (!actor || !id.success) {
      return fail(DM_MESSAGES.NOT_FOUND);
    }
    const view = await resolveDmView(id.data, actor);

    if (!view || view.access !== "member") {
      return fail(DM_MESSAGES.NOT_FOUND);
    }
    await markDmConversationRead(id.data, actor.id);
  },
);
