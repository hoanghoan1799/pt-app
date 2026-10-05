import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import {
  PASSWORD_HASH_PREFIX,
  SCRYPT_COST,
  SCRYPT_KEY_LENGTH,
  SCRYPT_SALT_BYTES,
} from "@/constants/password";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number },
) => Promise<Buffer>;

// Stored as "scrypt$<N>$<salt base64>$<hash base64>".
export const hashPassword = async (password: string) => {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const hash = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
  });

  return [
    PASSWORD_HASH_PREFIX,
    SCRYPT_COST,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
};

export const verifyPassword = async (password: string, storedHash: string) => {
  const [prefix, cost, salt, hash] = storedHash.split("$");

  if (prefix !== PASSWORD_HASH_PREFIX || !cost || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(
    password,
    Buffer.from(salt, "base64"),
    expected.length,
    {
      N: Number(cost),
    },
  );

  return timingSafeEqual(actual, expected);
};

// Hash of a random password, checked when the username doesn't exist so a
// wrong username takes as long as a wrong password (no username probing).
let dummyHashPromise: Promise<string> | null = null;

export const getDummyPasswordHash = () => {
  dummyHashPromise ??= hashPassword(
    randomBytes(SCRYPT_SALT_BYTES).toString("hex"),
  );
  return dummyHashPromise;
};
