import "server-only";

import type { GroupSummary, GroupUnreadResponse } from "@pt/contracts";

import { webizeUrlFields } from "@/features/chat/utils/api-urls";
import type { GroupThreadWire } from "@/features/chat-groups/utils/group-thread-map";
import { redirectForAuthError, runApi, tryApi } from "@/services/api/call";
import { logServerError } from "@/services/logger";

// Reads of the group screens, through the API (which checks membership on
// every call). File URLs are mapped to this app's proxy routes.

type Actor = "user" | "admin";

export const EMPTY_GROUP_UNREAD: GroupUnreadResponse = {
  total: 0,
  perGroup: [],
};

// The caller's groups, newest first (a super admin sees every group that is
// not dissolved). The inboxes list them next to the coach and trainee chats,
// so a failing group list shows no groups (and is logged) instead of taking
// the whole inbox down; an ended session or the admin lock still redirect.
export const listMyGroups = async (actor: Actor): Promise<GroupSummary[]> => {
  const outcome = await runApi(actor, (api) => api.GET("/v1/chat/groups"));

  if (outcome.ok) {
    return webizeUrlFields(outcome.data.groups) as GroupSummary[];
  }
  redirectForAuthError(actor, outcome.error);
  logServerError("listChatGroups", outcome.error);
  return [];
};

// The newest page of one group for its thread page, or null when the caller
// may not open it (missing, dissolved for a non super admin, not a member,
// left): the page answers 404 for all of them.
export const loadGroupThread = async (
  actor: Actor,
  groupId: number,
): Promise<GroupThreadWire | null> => {
  const outcome = await tryApi(actor, (api) =>
    api.GET("/v1/chat/groups/{groupId}/messages", {
      params: { path: { groupId } },
    }),
  );

  if (outcome.ok) {
    return webizeUrlFields(outcome.data) as GroupThreadWire;
  }
  if (outcome.error.status === 404 || outcome.error.status === 400) {
    return null;
  }
  throw outcome.error;
};

// Unread of every group for the badge; an answer the API cannot give counts as
// nothing, so a group hiccup never breaks the coach chat badge.
export const loadGroupUnread = async (
  actor: Actor,
): Promise<GroupUnreadResponse> => {
  const outcome = await runApi(actor, (api) =>
    api.GET("/v1/chat/groups/unread"),
  );

  return outcome.ok
    ? (outcome.data as GroupUnreadResponse)
    : EMPTY_GROUP_UNREAD;
};
