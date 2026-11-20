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

// Group message photos and the signed group photo.
const GROUP_PREFIX = ["/v1/chat/groups/", "/api/chat/groups/"] as const;

// Keys whose string value is a file URL in the group payloads.
const URL_KEYS: ReadonlySet<string> = new Set(["url", "avatarUrl"]);

const toWebFileUrl = (value: string) =>
  value.startsWith(GROUP_PREFIX[0])
    ? GROUP_PREFIX[1] + value.slice(GROUP_PREFIX[0].length)
    : toWebUrl(value);

// Walks a group payload and maps only its URL fields (`url`, `avatarUrl`):
// bodies, previews and names are user text and stay exactly as written, even
// when they look like an API path.
export const webizeUrlFields = <T>(value: T, key?: string): T => {
  if (typeof value === "string") {
    return (
      key !== undefined && URL_KEYS.has(key) ? toWebFileUrl(value) : value
    ) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => webizeUrlFields(item)) as T;
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        webizeUrlFields(item, name),
      ]),
    ) as T;
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
