import { describe, expect, it } from "vitest";

import { emailSchema, toEmailKey } from "@/utils/email";

describe("toEmailKey", () => {
  it("trims and lower-cases", () => {
    expect(toEmailKey(" An@Mail.COM ")).toBe("an@mail.com");
  });
});

describe("emailSchema", () => {
  it("trims a valid email", () => {
    expect(emailSchema.parse("  An@Mail.com ")).toBe("An@Mail.com");
  });

  it.each(["", "   ", "no-at-sign", "a@", "@b.com", "a b@c.com"])(
    "rejects %j",
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects more than 254 characters", () => {
    const long = `${"a".repeat(250)}@b.com`;

    expect(emailSchema.safeParse(long).success).toBe(false);
  });
});
