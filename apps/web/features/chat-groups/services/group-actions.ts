"use server";

import {
  GROUP_ERROR_CODES,
  GROUP_MESSAGES,
  groupAddMembersRequestSchema,
  groupCreateRequestSchema,
  groupEditMessageRequestSchema,
  groupHideRequestSchema,
  groupManagersOnlyRequestSchema,
  groupMarkReadRequestSchema,
  groupMemberKeyParamSchema,
  type GroupMessageView,
  groupMuteRequestSchema,
  groupReactRequestSchema,
  groupRenameRequestSchema,
  groupResolveAlertRequestSchema,
  groupSendMessageRequestSchema,
} from "@pt/contracts";
import { z } from "zod";

import { AVATAR_MESSAGES } from "@/features/avatar/constants/messages";
import { AVATAR_MAX_DATA_URL_LENGTH } from "@/features/avatar/utils/avatar-rules";
import { webizeUrlFields } from "@/features/chat/utils/api-urls";
import type { GroupAddResult } from "@/features/chat-groups/types/group";
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

// The group codes the API answers, as the texts the web localizes
// (GROUP_FULL, GROUP_NOT_FOUND, GROUP_NOT_MANAGER...). Keyed by code, so a
// reworded API message still shows the right translation.
const MESSAGE_OF_CODE: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.entries(GROUP_ERROR_CODES).map(([name, code]) => [
      code,
      GROUP_MESSAGES[name as keyof typeof GROUP_ERROR_CODES],
    ]),
  ),
  VALIDATION_FAILED: GROUP_MESSAGES.INVALID_INPUT,
  AVATAR_INVALID: AVATAR_MESSAGES.INVALID,
  AVATAR_TOO_LARGE: AVATAR_MESSAGES.TOO_LARGE,
};

// A refused request shows the text of its code, else the API's own text (403
// RESTRICTED, a 404 "message not found"...); a malformed one the generic
// "invalid".
const failFrom = (error: ApiError) =>
  fail(MESSAGE_OF_CODE[error.code] ?? error.message);

const KNOWN_MESSAGES: ReadonlySet<string> = new Set(
  Object.values(GROUP_MESSAGES),
);

// A refused input says why when the schema knows (the name rule), else the
// generic "invalid"; Zod's own English texts never reach the screen.
const failInput = (error: z.ZodError) => {
  const message = error.issues[0]?.message;

  return fail(
    message && KNOWN_MESSAGES.has(message)
      ? message
      : GROUP_MESSAGES.INVALID_INPUT,
  );
};

const done = (outcome: { ok: true } | { ok: false; error: ApiError }) =>
  outcome.ok ? { status: "success" as const } : failFrom(outcome.error);

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

// ---- membership and settings (company group-core) ----------------------------

export type GroupCreateResult =
  | { status: "success"; groupId: number; results: GroupAddResult[] }
  | { status: "error"; message: string };

export type GroupAddMembersResult =
  | { status: "success"; results: GroupAddResult[] }
  | { status: "error"; message: string };

export type GroupAvatarResult =
  | { status: "success"; avatarUrl: string | null }
  | { status: "error"; message: string };

// Create a group (super admin or PT): the API adds the creating PT, checks
// every id (own trainees for a PT, G1) and says per id what happened.
export const createGroupAction = withResultErrorHandling(
  "createGroup",
  async (input: unknown): Promise<GroupCreateResult> => {
    await requireAdmin();
    const parsed = groupCreateRequestSchema.safeParse(input);

    if (!parsed.success) {
      return failInput(parsed.error);
    }
    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/chat/groups", { body: parsed.data }),
    );

    return outcome.ok
      ? {
          status: "success",
          groupId: outcome.data.groupId,
          results: outcome.data.results,
        }
      : failFrom(outcome.error);
  },
);

const addInput = groupInput.and(groupAddMembersRequestSchema);

// Add trainees (and PTs, super admin only) to a group the caller manages. 409
// GROUP_FULL when nobody fits; otherwise a result per id.
export const addGroupMembersAction = withResultErrorHandling(
  "addGroupMembers",
  async (input: unknown): Promise<GroupAddMembersResult> => {
    await requireAdmin();
    const parsed = addInput.safeParse(input);

    if (!parsed.success) {
      return failInput(parsed.error);
    }
    const { groupId, userIds, ptIds } = parsed.data;
    const outcome = await tryApi("admin", (api) =>
      api.POST("/v1/chat/groups/{groupId}/members", {
        params: { path: { groupId } },
        body: { userIds, ptIds },
      }),
    );

    return outcome.ok
      ? { status: "success", results: outcome.data.results }
      : failFrom(outcome.error);
  },
);

const removeInput = groupInput.extend({ memberKey: groupMemberKeyParamSchema });

// Remove a trainee or PT ("user:<id>" | "admin:<id>"); a super admin cannot be
// removed (403 GROUP_CANNOT_REMOVE_MANAGER).
export const removeGroupMemberAction = withResultErrorHandling(
  "removeGroupMember",
  async (input: unknown) => {
    await requireAdmin();
    const parsed = removeInput.safeParse(input);

    if (!parsed.success) {
      return failInput(parsed.error);
    }
    const { groupId, memberKey } = parsed.data;

    return done(
      await tryApi("admin", (api) =>
        api.DELETE("/v1/chat/groups/{groupId}/members/{memberKey}", {
          params: { path: { groupId, memberKey } },
        }),
      ),
    );
  },
);

const renameInput = groupInput.and(groupRenameRequestSchema);

// Rename: 1 to 60 characters after the trim (GROUP_NAME_INVALID otherwise).
export const renameGroupAction = withResultErrorHandling(
  "renameGroup",
  async (input: unknown) => {
    await requireAdmin();
    const parsed = renameInput.safeParse(input);

    if (!parsed.success) {
      return failInput(parsed.error);
    }
    const { groupId, name } = parsed.data;

    return done(
      await tryApi("admin", (api) =>
        api.PUT("/v1/chat/groups/{groupId}/name", {
          params: { path: { groupId } },
          body: { name },
        }),
      ),
    );
  },
);

const avatarInput = groupInput.extend({
  // The browser's 256x256 data URL; null removes the photo. The API checks
  // the bytes and the type like an account photo.
  dataUrl: z.string().min(1).max(AVATAR_MAX_DATA_URL_LENGTH).nullable(),
});

// Set or clear the group photo. Answers the new signed photo URL (this app's
// route), or null.
export const setGroupAvatarAction = withResultErrorHandling(
  "setGroupAvatar",
  async (input: unknown): Promise<GroupAvatarResult> => {
    await requireAdmin();
    const parsed = avatarInput.safeParse(input);

    if (!parsed.success) {
      const dataUrl = (input as { dataUrl?: unknown } | null)?.dataUrl;

      return fail(
        typeof dataUrl === "string" &&
          dataUrl.length > AVATAR_MAX_DATA_URL_LENGTH
          ? AVATAR_MESSAGES.TOO_LARGE
          : GROUP_MESSAGES.INVALID_INPUT,
      );
    }
    const { groupId, dataUrl } = parsed.data;
    const outcome =
      dataUrl === null
        ? await tryApi("admin", (api) =>
            api.DELETE("/v1/chat/groups/{groupId}/avatar", {
              params: { path: { groupId } },
            }),
          )
        : await tryApi("admin", (api) =>
            api.PUT("/v1/chat/groups/{groupId}/avatar", {
              params: { path: { groupId } },
              body: { dataUrl },
            }),
          );

    return outcome.ok
      ? {
          status: "success",
          avatarUrl: webizeUrlFields(outcome.data).avatarUrl,
        }
      : failFrom(outcome.error);
  },
);

const managersOnlyInput = groupInput.and(groupManagersOnlyRequestSchema);

// "Chỉ quản lý được nhắn": trainees read only while it is on.
export const setGroupManagersOnlyAction = withResultErrorHandling(
  "setGroupManagersOnly",
  async (input: unknown) => {
    await requireAdmin();
    const parsed = managersOnlyInput.safeParse(input);

    if (!parsed.success) {
      return failInput(parsed.error);
    }
    const { groupId, enabled } = parsed.data;

    return done(
      await tryApi("admin", (api) =>
        api.PUT("/v1/chat/groups/{groupId}/managers-only", {
          params: { path: { groupId } },
          body: { enabled },
        }),
      ),
    );
  },
);

// Super admin only: soft dissolve (the data stays, the group leaves every
// list, sending stops). requireSuperAdmin() sends a PT back to the dashboard
// and the API refuses a PT as well.
export const dissolveGroupAction = withResultErrorHandling(
  "dissolveGroup",
  async (input: unknown) => {
    await requireSuperAdmin();
    const parsed = groupInput.safeParse(input);

    if (!parsed.success) {
      return failInput(parsed.error);
    }
    const { groupId } = parsed.data;

    return done(
      await tryApi("admin", (api) =>
        api.DELETE("/v1/chat/groups/{groupId}", {
          params: { path: { groupId } },
        }),
      ),
    );
  },
);

const muteInput = groupInput.and(groupMuteRequestSchema);

// My own notifications of the group; unread is unchanged.
const setMuted = async (actor: Actor, input: unknown) => {
  const parsed = muteInput.safeParse(input);

  if (!parsed.success) {
    return failInput(parsed.error);
  }
  const { groupId, muted } = parsed.data;

  return done(
    await tryApi(actor, (api) =>
      api.PUT("/v1/chat/groups/{groupId}/mute", {
        params: { path: { groupId } },
        body: { muted },
      }),
    ),
  );
};

// Leave on my own; only a manager can add me back. A super admin cannot leave
// (403 GROUP_MANAGER_CANNOT_LEAVE).
const leave = async (actor: Actor, input: unknown) => {
  const parsed = groupInput.safeParse(input);

  if (!parsed.success) {
    return failInput(parsed.error);
  }
  const { groupId } = parsed.data;

  return done(
    await tryApi(actor, (api) =>
      api.POST("/v1/chat/groups/{groupId}/leave", {
        params: { path: { groupId } },
      }),
    ),
  );
};

export const adminSetGroupMutedAction = withResultErrorHandling(
  "adminSetGroupMuted",
  async (input: unknown) => {
    await requireAdmin();
    return setMuted("admin", input);
  },
);

export const adminLeaveGroupAction = withResultErrorHandling(
  "adminLeaveGroup",
  async (input: unknown) => {
    await requireAdmin();
    return leave("admin", input);
  },
);

export const setGroupMutedAction = withResultErrorHandling(
  "setGroupMuted",
  async (input: unknown) => {
    await requireUser();
    return setMuted("user", input);
  },
);

export const leaveGroupAction = withResultErrorHandling(
  "leaveGroup",
  async (input: unknown) => {
    await requireUser();
    return leave("user", input);
  },
);
