import type { AuthActor } from "../auth/actor.js";

// A passcode-locked admin may not keep a socket: the web hides chat from them.
export const isLockedOut = (actor: AuthActor) =>
  actor.kind === "admin" && actor.locked;
