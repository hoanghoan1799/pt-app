import "server-only";

import { cookies } from "next/headers";

import { ADMIN_UNLOCK_COOKIE } from "@/constants/session";
import { UNLOCK_WINDOW_SECONDS } from "@/features/auth/utils/passcode-rules";
import {
  getSessionCookieOptions,
  signSession,
  verifySession,
} from "@/services/session-token";
import { isLockedFor, type UnlockProof } from "@/utils/admin-lock-rules";

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

export const clearUnlock = async () => {
  const cookieStore = await cookies();

  cookieStore.delete(ADMIN_UNLOCK_COOKIE);
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
