import { createHash, randomBytes } from "node:crypto";

export const TOKEN_BYTES = 32;

// 32 random bytes, base64url (43 characters). Shown to the client once.
export const generateToken = () =>
  randomBytes(TOKEN_BYTES).toString("base64url");

// Only this hash is stored. A fast hash is right here: the token already has
// 256 bits of entropy, unlike a password.
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest();

// Cheap shape check before touching the database.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43,128}$/;

export const isWellFormedToken = (value: string) => TOKEN_SHAPE.test(value);

// "Authorization: Bearer <token>" and nothing else (no cookies, no query).
export const parseBearer = (header: string | undefined) => {
  const match = /^Bearer ([^\s]+)$/i.exec(header ?? "");
  const token = match?.[1];

  return token && isWellFormedToken(token) ? token : null;
};
