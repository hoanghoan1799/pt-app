import { describe, expect, it } from "vitest";

import {
  GENERATED_PASSWORD_LENGTH,
  generatePassword,
  toEmailKey,
  toUsernameKey,
} from "./generate-password.js";

describe("generatePassword", () => {
  it("is 12 characters with an upper, a lower and a digit and no look-alikes", () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generatePassword();

      expect(password).toHaveLength(GENERATED_PASSWORD_LENGTH);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[2-9]/);
      expect(password).not.toMatch(/[IlO01]/);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 100 }, generatePassword));

    expect(seen.size).toBe(100);
  });
});

describe("keys", () => {
  it("lower-cases and trims emails and usernames", () => {
    expect(toEmailKey(" An@Mail.COM ")).toBe("an@mail.com");
    expect(toUsernameKey(" Coach.An ")).toBe("coach.an");
  });
});
