import { describe, expect, it } from "vitest";

import {
  displayNameFor,
  resolveDisplayName,
} from "@/features/chat/utils/display-name";

describe("resolveDisplayName", () => {
  it("prefers the nickname", () => {
    expect(resolveDisplayName("Bé Na", "An")).toBe("Bé Na");
  });

  it("falls back to the real name when there is no usable nickname", () => {
    expect(resolveDisplayName(null, "An")).toBe("An");
    expect(resolveDisplayName(undefined, "An")).toBe("An");
    expect(resolveDisplayName("", "An")).toBe("An");
    expect(resolveDisplayName("   ", "An")).toBe("An");
  });

  it("trims the nickname", () => {
    expect(resolveDisplayName("  Na ", "An")).toBe("Na");
  });
});

describe("displayNameFor", () => {
  const nicknames = { user: "Bé Na", "admin:2": "Coach" };

  it("looks up by target key", () => {
    expect(displayNameFor(nicknames, "user", "An")).toBe("Bé Na");
    expect(displayNameFor(nicknames, "admin:2", "pt2")).toBe("Coach");
  });

  it("uses the real name for targets without a nickname", () => {
    expect(displayNameFor(nicknames, "pt", "PT")).toBe("PT");
    expect(displayNameFor(nicknames, "admin:9", "pt9")).toBe("pt9");
    expect(displayNameFor(undefined, "user", "An")).toBe("An");
  });
});
