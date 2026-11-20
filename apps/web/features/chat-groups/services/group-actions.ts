"use server";

import {
  GROUP_ERROR_CODES,
  GROUP_MESSAGES,
  groupEditMessageRequestSchema,
  groupHideRequestSchema,
  groupMarkReadRequestSchema,
  type GroupMessageView,
  groupReactRequestSchema,
  groupResolveAlertRequestSchema,
  groupSendMessageRequestSchema,
} from "@pt/contracts";
import { z } from "zod";

import { webizeUrlFields } from "@/features/chat/utils/api-urls";
import { withResultErrorHandling } from "@/services/action-errors";
import { tryApi } from "@/services/api/call";
import type { ApiError } from "@/services/api/errors";
import {
  requireAdmin,
  requireSuperAdmin,
  requireUser,
} from "@/services/auth-guard";

// Server actions of the group thread, one export per role. Every admin action
// calls requireAdmin() first (requireSuperAdmin() for the PT-change alert) and
// every trainee action requireUser(); the session decides who acts, the ids
// are the only thing taken from the client, and the API checks membership,
// managers-only, the chat switch and restrictions on every call. Message
// bodies are never logged.

type Actor = "user" | "admin";

export type GroupMessageResult =
  | { status: "success"; message: GroupMessageView }
  | { status: "error"; message: string };

const fail = (message: string) => ({ status: "error" as const, message });

// A refused request shows the API's own text (403 RESTRICTED, managers-only,
// 404 "not found"...); a malformed one the generic "invalid".
const failFrom = (error: ApiError) =>
  fail(
    error.code === "VALIDATION_FAILED"
      ? GROUP_MESSAGES.INVALID_INPUT
      : error.message,
  );

const id = z.number().int().positive();
const groupInput = z.object({ groupId: id });
const messageInput = groupInput.extend({ messageId: id });

type MessageOutcome =
  | { ok: true; data: { message: GroupMessageView } }
  | { ok: false; error: ApiError };

const toResult = (outcome: MessageOutcome): GroupMessageResult =>
  outcome.ok
    ? { status: "success", message: webizeUrlFields(outcome.data.message) }
    : failFrom(outcome.error);

// ---- send -------------------------------------------------------------------

const sendInput = groupInput.extend({ clientId: z.uuid() });

// `clientId` is the idempotency key: a retried send answers with the stored
// message.
const send = async (actor: Actor, input: unknown) => {
  const ids = sendInput.safeParse(input);
  // The send schema keeps its own fields only (`groupId` is dropped).
  const body = groupSendMessageRequestSchema.safeParse(input);

  if (!ids.success || !body.success) {
    return fail(GROUP_MESSAGES.INVALID_INPUT);
  }
  return toResult(
    (await tryApi(actor, (api) =>
      api.POST("/v1/chat/groups/{groupId}/messages", {
        params: {
          path: { groupId: ids.data.groupId },
          header: { "Idempotency-Key": ids.data.clientId },
        },
        body: body.data,
      }),
    )) as MessageOutcome,
  );
};

// ---- react / edit / unsend / hide --------------------------------------------

const reactInput = messageInput.extend({ emoji: z.string().nullable() });

// One reaction per person: another emoji replaces it, null removes it.
const react = async (actor: Actor, input: unknown) => {
  const parsed = reactInput.safeParse(input);

  if (!parsed.success) {
    return fail(GROUP_MESSAGES.INVALID_INPUT);
  }
  const { groupId, messageId: mid, emoji } = parsed.data;

  if (emoji === null) {
    return toResult(
      (await tryApi(actor, (api) =>
        api.DELETE("/v1/chat/groups/{groupId}/messages/{mid}/reaction", {
          params: { path: { groupId, mid } },
        }),
      )) as MessageOutcome,
    );
  }
  const body = groupReactRequestSchema.safeParse({ emoji });

  if (!body.success) {
    return fail(GROUP_MESSAGES.INVALID_INPUT);
  }
  return toResult(
    (await tryApi(actor, (api) =>
      api.PUT("/v1/chat/groups/{groupId}/messages/{mid}/reaction", {
        params: { path: { groupId, mid } },
        body: body.data,
      }),
    )) as MessageOutcome,
  );
};

const editInput = messageInput.and(groupEditMessageRequestSchema);

// Only the author edits; the previous text goes to the history.
const edit = async (actor: Actor, input: unknown) => {
  const parsed = editInput.safeParse(input);

  if (!parsed.success) {
    return fail(GROUP_MESSAGES.INVALID_INPUT);
  }
  const { groupId, messageId: mid, body } = parsed.data;

  return toResult(
    (await tryApi(actor, (api) =>
      api.PATCH("/v1/chat/groups/{groupId}/messages/{mid}", {
        params: { path: { groupId, mid } },
        body: { body },
      }),
    )) as MessageOutcome,
  );
};

// Unsend for everyone (only the author): idempotent.
const unsend = async (actor: Actor, input: unknown) => {
  const parsed = messageInput.safeParse(input);

  if (!parsed.success) {
    return fail(GROUP_MESSAGES.INVALID_INPUT);
  }
  const { groupId, messageId: mid } = parsed.data;

  return toResult(
    (await tryApi(actor, (api) =>
      api.DELETE("/v1/chat/groups/{groupId}/messages/{mid}", {
        params: { path: { groupId, mid } },
      }),
    )) as MessageOutcome,
  );
};

// ---- read cursor ------------------------------------------------------------

const readInput = groupInput.and(groupMarkReadRequestSchema);

// Reading stays allowed while chat is off, restricted or managers-only.
const markRead = async (actor: Actor, input: unknown) => {
  const parsed = readInput.safeParse(input);

  if (!parsed.success) {
    return fail(GROUP_MESSAGES.INVALID_INPUT);
  }
  const { groupId, lastReadMessageId } = parsed.data;
  const outcome = await tryApi(actor, (api) =>
    api.POST("/v1/chat/groups/{groupId}/read", {
      params: { path: { groupId } },
      body: { lastReadMessageId },
    }),
  );

  if (!outcome.ok) {
    return failFrom(outcome.error);
  }
};

// ---- admins (super admin and PT) ---------------------------------------------

export const adminSendGroupMessageAction = withResultErrorHandling(
  "adminSendGroupMessage",
  async (input: unknown) => {
    await requireAdmin();
    return send("admin", input);
  },
);

export const adminReactGroupMessageAction = withResultErrorHandling(
  "adminReactGroupMessage",
  async (input: unknown) => {
    await requireAdmin();
    return react("admin", input);
  },
);

export const adminEditGroupMessageAction = withResultErrorHandling(
  "adminEditGroupMessage",
  async (input: unknown) => {
    await requireAdmin();
    return edit("admin", input);
  },
);

export const adminUnsendGroupMessageAction = withResultErrorHandling(
  "adminUnsendGroupMessage",
  async (input: unknown) => {
    await requireAdmin();
    return unsend("admin", input);
  },
);

export const adminMarkGroupReadAction = withResultErrorHandling(
  "adminMarkGroupRead",
  async (input: unknown) => {
    await requireAdmin();
    return markRead("admin", input);
  },
);

const hideInput = messageInput.and(groupHideRequestSchema);

// Hide or unhide anyone's message: a super admin or the creator PT (the API
// decides; a super admin's hide is undone by a super admin only).
export const hideGroupMessageAction = withResultErrorHandling(
  "hideGroupMessage",
  async (input: unknown) => {
    await requireAdmin();
    const parsed = hideInput.safeParse(input);

    if (!parsed.success) {
      return fail(GROUP_MESSAGES.INVALID_INPUT);
    }
    const { groupId, messageId: mid, hidden } = parsed.data;

    return toResult(
      (await tryApi("admin", (api) =>
        api.PUT("/v1/chat/groups/{groupId}/messages/{mid}/hidden", {
          params: { path: { groupId, mid } },
          body: { hidden },
        }),
      )) as MessageOutcome,
    );
  },
);

const alertInput = messageInput.and(groupResolveAlertRequestSchema);

// "Keep" or "Remove from group" on a PT-change alert (super admins only). A
// second tap, or a second super admin, gets who handled it first.
export const resolvePtChangeAlertAction = withResultErrorHandling(
  "resolvePtChangeAlert",
  async (input: unknown) => {
    await requireSuperAdmin();
    const parsed = alertInput.safeParse(input);

    if (!parsed.success) {
      return fail(GROUP_MESSAGES.INVALID_INPUT);
    }
    const { groupId, messageId: mid, choice } = parsed.data;
    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/chat/groups/{groupId}/messages/{mid}/alert", {
        params: { path: { groupId, mid } },
        body: { choice },
      }),
    );

    if (outcome.ok) {
      return { status: "success" as const };
    }
    const handledBy = outcome.error.details?.handledBy;

    if (outcome.error.code === GROUP_ERROR_CODES.ALERT_HANDLED) {
      return {
        status: "error" as const,
        message: GROUP_MESSAGES.ALERT_HANDLED,
        handledBy: typeof handledBy === "string" ? handledBy : null,
      };
    }
    return failFrom(outcome.error);
  },
);

// ---- trainees ---------------------------------------------------------------

export const sendGroupMessageAction = withResultErrorHandling(
  "sendGroupMessage",
  async (input: unknown) => {
    await requireUser();
    return send("user", input);
  },
);

export const reactGroupMessageAction = withResultErrorHandling(
  "reactGroupMessage",
  async (input: unknown) => {
    await requireUser();
    return react("user", input);
  },
);

export const editGroupMessageAction = withResultErrorHandling(
  "editGroupMessage",
  async (input: unknown) => {
    await requireUser();
    return edit("user", input);
  },
);

export const unsendGroupMessageAction = withResultErrorHandling(
  "unsendGroupMessage",
  async (input: unknown) => {
    await requireUser();
    return unsend("user", input);
  },
);

export const markGroupReadAction = withResultErrorHandling(
  "markGroupRead",
  async (input: unknown) => {
    await requireUser();
    return markRead("user", input);
  },
);
