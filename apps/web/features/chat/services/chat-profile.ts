import "server-only";

import type { ChatProfile } from "@pt/contracts";

import { isChatColorKey } from "@/features/chat/utils/chat-palette";
import { callApi, tryApi } from "@/services/api/call";

// Nicknames and bubble colours (KAN-141). The API decides who may change what;
// these wrap its colour and nickname routes. Nicknames are shared by the whole
// conversation (Messenger style): they arrive in the thread's `profile` and
// every member sees the same ones. Private aliases (contact-aliases) are not
// used in chat.

export type { ChatProfile };

export const EMPTY_CHAT_PROFILE: ChatProfile = { nicknames: {}, colors: {} };

export type ProfileResult =
  | { status: "success"; profile: ChatProfile }
  | { status: "error"; message: string };

export type ColorBody = { color: ChatProfile["colors"][string] | null };

export type NicknameBody = { target: string; nickname: string };

// Sets or clears (blank) a nickname in the trainee's own conversation. The
// result carries the refreshed profile.
export const setTraineeNickname = async (
  body: NicknameBody,
): Promise<ProfileResult> => {
  const outcome = await tryApi("user", (api) =>
    api.PUT("/v1/chat/conversations/me/nickname", { body }),
  );

  return outcome.ok
    ? { status: "success", profile: outcome.data.profile }
    : { status: "error", message: outcome.error.message };
};

// The same for an admin, in the conversation they name.
export const setAdminNickname = async (
  conversationId: number,
  body: NicknameBody,
): Promise<ProfileResult> => {
  const outcome = await tryApi("admin", (api) =>
    api.PUT("/v1/chat/conversations/{cid}/nickname", {
      params: { path: { cid: conversationId } },
      body,
    }),
  );

  return outcome.ok
    ? { status: "success", profile: outcome.data.profile }
    : { status: "error", message: outcome.error.message };
};

// The trainee's own colour. The result carries the refreshed profile.
export const setTraineeColor = async (
  body: ColorBody,
  loadProfile: () => Promise<ChatProfile>,
): Promise<ProfileResult> => {
  const outcome = await tryApi("user", (api) =>
    api.PUT("/v1/users/me/chat-color", { body }),
  );

  return outcome.ok
    ? { status: "success", profile: await loadProfile() }
    : { status: "error", message: outcome.error.message };
};

// An admin's account colour: shows in every conversation without an override.
export const setAdminAccountColor = async (
  body: ColorBody,
): Promise<{ status: "success" } | { status: "error"; message: string }> => {
  const outcome = await tryApi("admin", (api) =>
    api.PUT("/v1/admins/me/chat-color", { body }),
  );

  return outcome.ok
    ? { status: "success" }
    : { status: "error", message: outcome.error.message };
};

// An admin's colour for one conversation only; null removes the override.
export const setAdminConversationColor = async (
  conversationId: number,
  body: ColorBody,
): Promise<ProfileResult> => {
  const outcome = await tryApi("admin", (api) =>
    api.PUT("/v1/chat/conversations/{cid}/color", {
      params: { path: { cid: conversationId } },
      body,
    }),
  );

  return outcome.ok
    ? { status: "success", profile: outcome.data.profile }
    : { status: "error", message: outcome.error.message };
};

// The admin's saved account colour (null when never picked), so the settings
// sheet can preselect it.
export const loadAdminAccountColor = async () => {
  const me = await callApi("admin", (api) => api.GET("/v1/admins/me"));

  return isChatColorKey(me.chatColor) ? me.chatColor : null;
};
