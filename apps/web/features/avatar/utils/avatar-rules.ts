// Profile photos (KAN-157). The browser crops to a 256x256 square and encodes
// WebP/JPEG at ~0.8; the API checks the bytes and the type (PUT
// /v1/users/me/avatar, /v1/admins/me/avatar), so only the size guard that keeps
// a huge request from being forwarded lives here.

export const AVATAR_SIZE_PX = 256;
export const AVATAR_QUALITY = 0.8;
// Decoded image bytes. A 256x256 photo at q0.8 is ~15-30 KB; this is headroom.
export const AVATAR_MAX_BYTES = 80 * 1024;
// base64 is 4/3 larger, plus the "data:image/webp;base64," prefix.
export const AVATAR_MAX_DATA_URL_LENGTH =
  Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 64;

export type AvatarKind = "user" | "admin";

export const isAvatarKind = (value: unknown): value is AvatarKind =>
  value === "user" || value === "admin";

// The versioned URL payloads carry instead of the image itself. Null when
// there is no photo.
export const avatarUrl = (
  kind: AvatarKind,
  id: number,
  updatedAt: Date | null | undefined,
): string | null =>
  updatedAt
    ? `/api/avatar/${kind}/${id}?v=${Math.floor(updatedAt.getTime() / 1000)}`
    : null;

// The API names its photos /v1/avatars/<kind>/<id>?v=<version>; the browser
// reaches them through this app (app/api/avatar), which proxies to the API.
export const toWebAvatarUrl = (url: string | null | undefined) =>
  url ? url.replace(/^\/v1\/avatars\//, "/api/avatar/") : null;

// Key of the thread's avatar map, same shape as nickname targets.
export const avatarKey = (kind: AvatarKind, id: number | null) =>
  kind === "user" ? "user" : `admin:${id}`;
