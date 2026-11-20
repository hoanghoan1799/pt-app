"use client";

import { useEffect, useMemo, useRef } from "react";

import { uploadChatPhoto } from "@/features/chat/hooks/use-chat-adapter";
import type {
  ChatAdapter,
  MessageActionResult,
  SendMessageResult,
} from "@/features/chat/hooks/use-chat-messages";
import type { ThreadViewer } from "@/features/chat/utils/chat-thread-rules";
import { contentInput } from "@/features/chat/utils/content-input";
import {
  adminEditGroupMessageAction,
  adminMarkGroupReadAction,
  adminReactGroupMessageAction,
  adminSendGroupMessageAction,
  adminUnsendGroupMessageAction,
  editGroupMessageAction,
  type GroupMessageResult,
  markGroupReadAction,
  reactGroupMessageAction,
  sendGroupMessageAction,
  unsendGroupMessageAction,
} from "@/features/chat-groups/services/group-actions";
import {
  type GroupApiRole,
  groupRoutes,
} from "@/features/chat-groups/utils/group-adapter-urls";
import {
  type GroupState,
  groupStateOf,
  isGroupThreadWire,
  parseGroupThread,
  toChatMessage,
} from "@/features/chat-groups/utils/group-thread-map";

interface Options {
  groupId: number;
  role: GroupApiRole;
  viewer: Extract<ThreadViewer, { role: "member" }>;
  // Called with the group's switches every time a fetched payload carries
  // them (managers-only, dissolved and the person's own block can change while
  // the thread is open).
  onGroupState?: (state: GroupState) => void;
}

const toResult = (
  result: GroupMessageResult | { status: "error"; message: string },
  viewerKey: string,
): MessageActionResult & SendMessageResult =>
  result.status === "success"
    ? { status: "success", message: toChatMessage(result.message, viewerKey) }
    : { status: "error", message: result.message };

// The ChatAdapter of a group: the same seam the coach chat uses, wired to the
// group routes and the role's server actions. The shared hook keeps the
// optimistic bubbles, the polling and the mutations; only the URLs, the action
// calls and the payload shape differ.
export const useGroupChatAdapter = ({
  groupId,
  role,
  viewer,
  onGroupState,
}: Options): ChatAdapter => {
  const { key, name } = viewer;
  const groupStateRef = useRef(onGroupState);

  useEffect(() => {
    groupStateRef.current = onGroupState;
  });

  return useMemo<ChatAdapter>(() => {
    const routes = groupRoutes(groupId, role);
    const isAdmin = role === "admin";
    const send = isAdmin ? adminSendGroupMessageAction : sendGroupMessageAction;
    const react = isAdmin
      ? adminReactGroupMessageAction
      : reactGroupMessageAction;
    const edit = isAdmin ? adminEditGroupMessageAction : editGroupMessageAction;
    const unsend = isAdmin
      ? adminUnsendGroupMessageAction
      : unsendGroupMessageAction;
    const markRead = isAdmin ? adminMarkGroupReadAction : markGroupReadAction;

    return {
      messagesUrl: routes.messages,
      editsUrl: routes.edits,
      viewer: { role: "member", key, name },
      parseThread: (raw) => {
        const snapshot = parseGroupThread(raw, key);

        if (snapshot && isGroupThreadWire(raw)) {
          groupStateRef.current?.(groupStateOf(raw));
        }
        return snapshot;
      },
      uploadPhoto: (blob) => uploadChatPhoto(blob, routes.photos),
      sendMessage: async (content, clientId, replyToMessageId) =>
        toResult(
          (await send({
            groupId,
            ...contentInput(content),
            clientId,
            replyToMessageId,
          })) as GroupMessageResult,
          key,
        ),
      reactMessage: async (messageId, emoji) =>
        toResult(
          (await react({ groupId, messageId, emoji })) as GroupMessageResult,
          key,
        ),
      editMessage: async (messageId, body) =>
        toResult(
          (await edit({ groupId, messageId, body })) as GroupMessageResult,
          key,
        ),
      unsendMessage: async (messageId) =>
        toResult(
          (await unsend({ groupId, messageId })) as GroupMessageResult,
          key,
        ),
      markRead: (lastReadMessageId) => markRead({ groupId, lastReadMessageId }),
    };
  }, [groupId, role, key, name]);
};
