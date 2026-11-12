// The API names files by its own paths (`/v1/chat/photos/12`); the browser only
// talks to this web app, which proxies them under `/api/...`. Pure, so the
// mapping is testable.

const PREFIXES: readonly (readonly [string, string])[] = [
  ["/v1/chat/photos/", "/api/chat/photos/"],
  ["/v1/chat/stickers/custom/", "/api/chat/stickers/custom/"],
  ["/v1/dm/photos/", "/api/dm/photos/"],
  ["/v1/social/photos/", "/api/social/photos/"],
  ["/v1/avatars/", "/api/avatar/"],
];

export const toWebUrl = (value: string) => {
  for (const [from, to] of PREFIXES) {
    if (value.startsWith(from)) {
      return to + value.slice(from.length);
    }
  }
  return value;
};

// Walks a JSON value and maps every API file path in it.
export const webizeUrls = <T>(value: T): T => {
  if (typeof value === "string") {
    return toWebUrl(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => webizeUrls(item)) as T;
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, webizeUrls(item)]),
    ) as T;
  }
  return value;
};
