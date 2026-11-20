import "server-only";

import type { GroupSummary, GroupUnreadResponse } from "@pt/contracts";

import { webizeUrls } from "@/features/chat/utils/api-urls";
import type { GroupThreadWire } from "@/features/chat-groups/utils/group-thread-map";
import { callApi, runApi, tryApi } from "@/services/api/call";

// Reads of the group screens, through the API (which checks membership on
// every call). File URLs are mapped to this app's proxy routes.

type Actor = "user" | "admin";

export const EMPTY_GROUP_UNREAD: GroupUnreadResponse = {
  total: 0,
  perGroup: [],
};

// The caller's groups, newest first (a super admin sees every group that is
// not dissolved).
export const listMyGroups = async (actor: Actor): Promise<GroupSummary[]> => {
  const data = await callApi(actor, (api) => api.GET("/v1/chat/groups"));

  return webizeUrls(data.groups) as GroupSummary[];
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
    return webizeUrls(outcome.data) as GroupThreadWire;
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
