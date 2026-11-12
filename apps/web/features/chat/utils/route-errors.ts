// The `error` key the chat route handlers have always sent, from the API's
// stable error code. Pure, so it is testable.

const KEYS: Record<string, string> = {
  CHAT_LOCKED: "chat_locked",
  PHOTO_TOO_LARGE: "too_large",
  STICKER_TOO_LARGE: "too_large",
  BAD_IMAGE: "bad_image",
  RATE_LIMITED: "rate_limited",
  GIPHY_UNAVAILABLE: "giphy_unavailable",
  STICKER_LIMIT: "limit",
  VALIDATION_FAILED: "invalid_query",
};

export const routeErrorKey = (code: string, status: number) => {
  const known = KEYS[code];

  if (known) {
    return known;
  }
  if (status === 401) {
    return "unauthorized";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 413) {
    return "too_large";
  }
  if (status === 403) {
    return "forbidden";
  }
  return status >= 500 ? "failed" : code.toLowerCase();
};
