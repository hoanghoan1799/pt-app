export interface UnlockProof {
  adminId: number;
  // Unix seconds.
  expiresAt: number;
}

// The admin is locked when they have a passcode and no valid unlock proof of
// their own. No passcode = never locked (KAN-160, Q3).
export const isLockedFor = (
  admin: { id: number; hasPasscode: boolean },
  proof: UnlockProof | null,
  nowSeconds: number,
) => {
  if (!admin.hasPasscode) {
    return false;
  }
  if (!proof) {
    return true;
  }
  return proof.adminId !== admin.id || proof.expiresAt <= nowSeconds;
};

// Hidden trainees (KAN-163) are visible only with a reveal proof the admin
// earned themselves that has not expired yet.
export const isRevealValidFor = (
  adminId: number,
  proof: UnlockProof | null,
  nowSeconds: number,
) =>
  Boolean(proof) && proof?.adminId === adminId && proof.expiresAt > nowSeconds;
