import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import {
  GENERATED_PASSWORD_ALPHABET,
  GENERATED_PASSWORD_DIGITS,
  GENERATED_PASSWORD_LENGTH,
  GENERATED_PASSWORD_LOWER,
  GENERATED_PASSWORD_UPPER,
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

const pick = (chars: string) => chars[randomInt(chars.length)];

// Random password for a trainee, shown to the admin once (KAN-82, D3). At
// least one upper, lower and digit, then shuffled so they are not up front.
export const generatePassword = () => {
  const chars = [
    pick(GENERATED_PASSWORD_UPPER),
    pick(GENERATED_PASSWORD_LOWER),
    pick(GENERATED_PASSWORD_DIGITS),
  ];

  while (chars.length < GENERATED_PASSWORD_LENGTH) {
    chars.push(pick(GENERATED_PASSWORD_ALPHABET));
  }

  // Fisher-Yates with a CSPRNG.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);

    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};
