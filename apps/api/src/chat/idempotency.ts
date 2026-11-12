import { chatErrors } from "./chat.errors.js";

// `Idempotency-Key`: 8-64 characters of letters, digits, `-` and `_` (a UUID
// fits). The same key from the same person in the same conversation always
// answers with the first result.
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export const IDEMPOTENCY_HEADER = "idempotency-key";

// The header wins over a `clientId` in the body (the web client's field).
// `required` keys (message creation) fail with 400 when neither is present.
export const parseIdempotencyKey = (
  header: string | undefined,
  bodyKey?: string,
  required = false,
): string | null => {
  const key = (header ?? bodyKey)?.trim();

  if (key === undefined || key === "") {
    if (required) {
      throw chatErrors.invalidKey();
    }
    return null;
  }
  if (!KEY_PATTERN.test(key)) {
    throw chatErrors.invalidKey();
  }
  return key;
};
