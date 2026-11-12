import "server-only";

import { callApi } from "@/services/api/call";
import { fetchMe } from "@/services/api/me";

// The passcode lock and the hidden-trainee reveal live on the API session
// (GET /v1/auth/me: `locked`, `revealedUntil`). The web keeps no unlock or
// reveal cookie any more.

// Locked = the admin has a passcode and no valid unlock on this session.
export const isAdminLocked = (admin: { locked: boolean }) => admin.locked;

// True while this admin's own reveal window (10 minutes, set by the API when
// the right passcode was typed) is open.
export const canSeeHiddenUsers = async (adminId: number) => {
  const me = await fetchMe("admin");

  if (me?.actor.kind !== "admin" || me.actor.id !== adminId) {
    return false;
  }
  return Boolean(
    me.actor.revealedUntil && Date.parse(me.actor.revealedUntil) > Date.now(),
  );
};

// Slides the unlock window of an unlocked admin forward. The API does this on
// its presence heartbeat, so this is that call. Used by app/api/presence until
// the chat area talks to the API itself.
export const issueUnlock = async (adminId: number) => {
  void adminId;
  await callApi("admin", (api) => api.POST("/v1/presence/heartbeat"));
};
