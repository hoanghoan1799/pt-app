import { BadRequestException } from "@nestjs/common";

// Opaque cursors: base64url of a small JSON tuple. A tampered cursor is a 400.

const invalid = () =>
  new BadRequestException({
    code: "VALIDATION_FAILED",
    message: "cursor: invalid",
  });

export const encodeCursor = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const decode = (cursor: string): unknown => {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
};

const isId = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value > 0 &&
  value <= 2_147_483_647;

// Posts: newest first by id.
export const decodeIdCursor = (cursor: string): number => {
  const value = decode(cursor);

  if (!Array.isArray(value) || value.length !== 1 || !isId(value[0])) {
    throw invalid();
  }
  return value[0];
};
export const idCursor = (id: number) => encodeCursor([id]);

// Notifications and comments: (created_at, id) keyset.
export type TimeCursor = { at: string; id: number };

export const decodeTimeCursor = (cursor: string): TimeCursor => {
  const value = decode(cursor);

  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== "string" ||
    Number.isNaN(Date.parse(value[0])) ||
    !isId(value[1])
  ) {
    throw invalid();
  }
  return { at: value[0], id: value[1] };
};
export const timeCursor = (at: Date, id: number) =>
  encodeCursor([at.toISOString(), id]);
