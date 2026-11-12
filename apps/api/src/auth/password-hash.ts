import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { Injectable } from "@nestjs/common";

// Same format and cost as apps/web/services/password.ts, so hashes migrated
// from Turso keep working: "scrypt$<N>$<salt base64>$<hash base64>".
export const SCRYPT_COST = 16384;
export const SCRYPT_KEY_LENGTH = 64;
export const SCRYPT_SALT_BYTES = 16;
export const PASSWORD_HASH_PREFIX = "scrypt";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number },
) => Promise<Buffer>;

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
    { N: Number(cost) },
  );

  return timingSafeEqual(actual, expected);
};

// Injectable wrapper so services can be tested with a fake hasher.
@Injectable()
export class PasswordHasher {
  private dummyHash: Promise<string> | null = null;

  hash(password: string) {
    return hashPassword(password);
  }

  verify(password: string, storedHash: string) {
    return verifyPassword(password, storedHash);
  }

  // Hash of a random password, checked when the account does not exist so an
  // unknown name takes as long as a wrong password (no account probing).
  dummy() {
    this.dummyHash ??= hashPassword(
      randomBytes(SCRYPT_SALT_BYTES).toString("hex"),
    );
    return this.dummyHash;
  }
}
