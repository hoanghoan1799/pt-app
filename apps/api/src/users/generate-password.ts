import { randomInt } from "node:crypto";

// Generated trainee passwords: no look-alikes (I, l, O, 0, 1).
export const GENERATED_PASSWORD_LENGTH = 12;
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const ALPHABET = UPPER + LOWER + DIGITS;

const pick = (chars: string) => chars[randomInt(chars.length)];

// Random password for a trainee, shown to the admin once (KAN-82, D3). At
// least one upper, lower and digit, then shuffled so they are not up front.
export const generatePassword = () => {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];

  while (chars.length < GENERATED_PASSWORD_LENGTH) {
    chars.push(pick(ALPHABET));
  }
  // Fisher-Yates with a CSPRNG.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);

    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

// Lookup key: " An@Mail.COM " and "an@mail.com" are the same login.
export const toEmailKey = (email: string) => email.trim().toLowerCase();

export const toUsernameKey = (username: string) =>
  username.trim().toLowerCase();
