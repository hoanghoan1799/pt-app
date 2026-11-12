// Back from the trainee thread: step back in history only when the previous
// entry is a page of this app; a deep link, a push-notification open or a
// fresh tab has nothing sensible behind it, so go to the workouts instead.
export const canGoBackInApp = (
  historyLength: number,
  referrer: string,
  origin: string,
): boolean => {
  if (historyLength <= 1 || referrer === "") {
    return false;
  }
  try {
    return new URL(referrer).origin === origin;
  } catch {
    return false;
  }
};
