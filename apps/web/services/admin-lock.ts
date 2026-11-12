import "server-only";

import { cookies } from "next/headers";

import {
  ADMIN_REVEAL_COOKIE,
  ADMIN_UNLOCK_COOKIE,
  REVEAL_WINDOW_SECONDS,
} from "@/constants/session";
import { UNLOCK_WINDOW_SECONDS } from "@/features/auth/utils/passcode-rules";
import {
  getSessionCookieOptions,
  signSession,
  verifySession,
} from "@/services/session-token";
import {
  isLockedFor,
  isRevealValidFor,
  type UnlockProof,
} from "@/utils/admin-lock-rules";

const readUnlockProof = async (): Promise<UnlockProof | null> => {
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(ADMIN_UNLOCK_COOKIE)?.value,
  );

  // An admin session token is never an unlock proof.
  return session?.role === "unlock"
    ? { adminId: session.adminId, expiresAt: session.expiresAt ?? 0 }
    : null;
};

// Writes a fresh 5-minute proof. Used after a right passcode and by the
// presence heartbeat (sliding window) while the admin is unlocked.
export const issueUnlock = async (adminId: number) => {
  const token = await signSession(
    { role: "unlock", adminId },
    UNLOCK_WINDOW_SECONDS,
  );
  const cookieStore = await cookies();

  cookieStore.set(
    ADMIN_UNLOCK_COOKIE,
    token,
    getSessionCookieOptions(UNLOCK_WINDOW_SECONDS),
  );
};

export const clearReveal = async () => {
  const cookieStore = await cookies();

  cookieStore.delete(ADMIN_REVEAL_COOKIE);
};

// Locking or signing out also ends the reveal (KAN-163).
export const clearUnlock = async () => {
  const cookieStore = await cookies();

  cookieStore.delete(ADMIN_UNLOCK_COOKIE);
  cookieStore.delete(ADMIN_REVEAL_COOKIE);
};

// Written after a right passcode typed to see hidden trainees. Fixed 10 min
// window, not refreshed by the heartbeat.
export const issueReveal = async (adminId: number) => {
  const token = await signSession(
    { role: "reveal", adminId },
    REVEAL_WINDOW_SECONDS,
  );
  const cookieStore = await cookies();

  cookieStore.set(
    ADMIN_REVEAL_COOKIE,
    token,
    getSessionCookieOptions(REVEAL_WINDOW_SECONDS),
  );
};

// True while this admin's own reveal proof is valid. Another admin's cookie,
// an unlock/session token or an expired proof all answer false.
export const canSeeHiddenUsers = async (adminId: number) => {
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(ADMIN_REVEAL_COOKIE)?.value,
  );

  if (session?.role !== "reveal") {
    return false;
  }
  return isRevealValidFor(
    adminId,
    { adminId: session.adminId, expiresAt: session.expiresAt ?? 0 },
    Date.now() / 1000,
  );
};

// Locked = the admin has a passcode and no valid unlock for themselves.
// Admins without a passcode skip the cookie read entirely.
export const isAdminLocked = async (admin: {
  id: number;
  hasPasscode: boolean;
}) => {
  if (!admin.hasPasscode) {
    return false;
  }
  return isLockedFor(admin, await readUnlockProof(), Date.now() / 1000);
};
