import { describe, expect, it } from "vitest";

import {
  adminLabel,
  bubbleColorFor,
  canSaveNickname,
  isNicknameTooLong,
  settingsTargets,
} from "@/features/chat/utils/chat-settings";

const admin = {
  role: "admin" as const,
  adminId: 7,
  adminName: "hoan",
  peerName: "An",
};

describe("settingsTargets", () => {
  it("gives the trainee the PT side and themselves", () => {
    expect(
      settingsTargets({ role: "user" }, { peerName: "PT", selfName: "An" }),
    ).toEqual({
      other: { key: "pt", realName: "PT" },
      self: { key: "user", realName: "An" },
    });
  });

  it("gives the admin the trainee and their own admin key", () => {
    expect(
      settingsTargets(admin, { peerName: "An", selfName: "hoan" }),
    ).toEqual({
      other: { key: "user", realName: "An" },
      self: { key: "admin:7", realName: "hoan" },
    });
  });
});

describe("canSaveNickname", () => {
  it("is off when nothing changed", () => {
    expect(canSaveNickname("Bé Na", "Bé Na")).toBe(false);
    expect(canSaveNickname("  ", undefined)).toBe(false);
  });

  it("is on for a new, changed or cleared nickname", () => {
    expect(canSaveNickname("Bé Na", undefined)).toBe(true);
    expect(canSaveNickname("Na", "Bé Na")).toBe(true);
    expect(canSaveNickname("", "Bé Na")).toBe(true);
  });

  it("is off over 30 characters and counts code points", () => {
    expect(isNicknameTooLong("a".repeat(30))).toBe(false);
    expect(isNicknameTooLong("a".repeat(31))).toBe(true);
    expect(isNicknameTooLong("💪".repeat(30))).toBe(false);
    expect(canSaveNickname("a".repeat(31), undefined)).toBe(false);
  });
});

describe("bubbleColorFor", () => {
  const colors = { user: "blue", "admin:7": "teal", "admin:8": "nope" };

  it("uses the sender's picked colour on either side", () => {
    expect(
      bubbleColorFor({ senderRole: "user", senderAdminId: null }, true, colors),
    ).toBe("blue");
    expect(
      bubbleColorFor({ senderRole: "admin", senderAdminId: 7 }, false, colors),
    ).toBe("teal");
  });

  it("defaults my own bubbles to orange", () => {
    expect(
      bubbleColorFor({ senderRole: "user", senderAdminId: null }, true, {}),
    ).toBe("orange");
    expect(
      bubbleColorFor({ senderRole: "admin", senderAdminId: 8 }, true, colors),
    ).toBe("orange");
  });

  it("keeps the other side neutral until they pick", () => {
    expect(
      bubbleColorFor({ senderRole: "admin", senderAdminId: 9 }, false, colors),
    ).toBeNull();
    expect(
      bubbleColorFor({ senderRole: "admin", senderAdminId: null }, false, {}),
    ).toBeNull();
  });
});

describe("adminLabel", () => {
  it("prefers the admin's own nickname, then the shared PT one, then the name", () => {
    expect(adminLabel({ "admin:7": "Coach", pt: "PT" }, 7, "hoan", "pt")).toBe(
      "Coach",
    );
    expect(adminLabel({ pt: "Thầy" }, 7, "hoan", "pt")).toBe("Thầy");
    expect(adminLabel({ pt: "Thầy" }, 7, "hoan")).toBe("hoan");
    expect(adminLabel({}, 7, "hoan", "pt")).toBe("hoan");
  });
});
