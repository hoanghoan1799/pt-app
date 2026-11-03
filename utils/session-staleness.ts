// A session is stale when it was issued (JWT `iat`, whole seconds) before the
// password last changed. Both sides are whole seconds, so the fresh session a
// trainee gets right after changing their own password is not stale.
export const isSessionStale = (
  issuedAtSeconds: number,
  passwordChangedAt: Date | null,
) => {
  if (!passwordChangedAt) {
    return false;
  }
  return issuedAtSeconds < Math.floor(passwordChangedAt.getTime() / 1000);
};
