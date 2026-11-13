import { AVATAR_MAX_BYTES } from "@pt/contracts";

import { detectImageMime } from "../../src/files/image-rules.js";
import { sha256Hex, type SourceValue } from "./convert.js";

// In the frozen Turso schema the profile photo is a base64 data URL in a text
// column of users and admins. In PostgreSQL it is a row in its own table
// (migration AvatarTables1795000000000), so the column is read from the source
// but never inserted into users/admins: it goes to the avatar table, decoded.
export type MovedAvatar = {
  // Source table and column.
  table: "users" | "admins";
  column: "avatar";
  // Source column holding the cache version, which stays in the owner table.
  versionColumn: "avatar_updated_at";
  // PostgreSQL side.
  targetTable: "user_avatars" | "admin_avatars";
  targetKey: "user_id" | "admin_id";
};

export const MOVED_AVATARS: MovedAvatar[] = [
  {
    table: "users",
    column: "avatar",
    versionColumn: "avatar_updated_at",
    targetTable: "user_avatars",
    targetKey: "user_id",
  },
  {
    table: "admins",
    column: "avatar",
    versionColumn: "avatar_updated_at",
    targetTable: "admin_avatars",
    targetKey: "admin_id",
  },
];

export const AVATAR_TARGET_TABLES = MOVED_AVATARS.map(
  (moved) => moved.targetTable,
);

export const movedAvatarOf = (table: string) =>
  MOVED_AVATARS.find((moved) => moved.table === table);

export const isMovedColumn = (table: string, column: string) =>
  movedAvatarOf(table)?.column === column;

// Columns of the avatar tables, in insert order.
export const AVATAR_COLUMNS = ["mime", "data", "size", "updated_at"] as const;

export type DecodedAvatar = {
  mime: "image/webp" | "image/jpeg" | "image/png";
  bytes: Buffer;
  // Epoch milliseconds of avatar_updated_at.
  updatedAtMs: number;
};

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

// A source avatar (data URL text) and its version (epoch seconds, the
// SQLite `avatar_updated_at`) -> the row to insert, or the problem. Never
// echoes the value (reports may be shared). Stricter than "any text": the
// image type must be one the API serves and agree with the bytes, because the
// avatar route answers 404 for anything else.
export const decodeSourceAvatar = (
  value: SourceValue,
  updatedAtSeconds: SourceValue,
): { ok: true; avatar: DecodedAvatar } | { ok: false; problem: string } => {
  if (typeof value !== "string") {
    return { ok: false, problem: "avatar is not text" };
  }

  const match = DATA_URL.exec(value);

  if (!match) {
    return {
      ok: false,
      problem: `avatar is not a base64 image data URL (text of ${value.length} characters)`,
    };
  }

  const bytes = Buffer.from(match[2], "base64");

  // Buffer ignores a wrong tail silently; re-encoding proves valid base64.
  if (bytes.toString("base64") !== match[2]) {
    return { ok: false, problem: "avatar is not valid base64" };
  }

  if (bytes.length === 0 || bytes.length > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      problem: `avatar decodes to ${bytes.length} bytes (allowed 1 to ${AVATAR_MAX_BYTES})`,
    };
  }

  const mime = detectImageMime(bytes);

  if (mime === null || mime !== match[1]) {
    return {
      ok: false,
      problem: `avatar declares ${match[1]} but its bytes are ${mime ?? "not a png, jpeg or webp image"}`,
    };
  }

  if (
    typeof updatedAtSeconds !== "number" ||
    !Number.isInteger(updatedAtSeconds)
  ) {
    return {
      ok: false,
      problem: "avatar has no avatar_updated_at (the version the URL needs)",
    };
  }

  return {
    ok: true,
    avatar: { mime, bytes, updatedAtMs: updatedAtSeconds * 1000 },
  };
};

// The comparison token of one avatar, derived on each side on its own path:
// the source from the decoded data URL, the target from the stored row.
export const avatarToken = (
  id: number | string,
  mime: string,
  size: number,
  bytes: Buffer,
  updatedAtMs: number,
) => `${id}|${mime}|${size}|${sha256Hex(bytes)}|${updatedAtMs}`;
