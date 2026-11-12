import { describe, expect, it } from "vitest";

import {
  adminLabel,
  bubbleColorFor,
  settingsTargets,
} from "@/features/chat/utils/chat-settings";

const admin = {
  role: "admin" as const,
  adminId: 7,
  adminName: "hoan",
  peerName: "An",
};

describe("settingsTargets", () => {
  it("lets the trainee name the PT side, and picks their own colour", () => {
    expect(settingsTargets({ role: "user" }, { peerName: "PT" })).toEqual({
      other: { key: "pt", realName: "PT" },
      self: { key: "user" },
    });
  });

  it("lets the admin name the trainee, and picks their own colour", () => {
    expect(settingsTargets(admin, { peerName: "An" })).toEqual({
      other: { key: "user", realName: "An" },
      self: { key: "admin:7" },
    });
  });

  it("never offers a nickname for yourself", () => {
    for (const viewer of [{ role: "user" as const }, admin]) {
      const { other, self } = settingsTargets(viewer, { peerName: "x" });

      expect(other.key).not.toBe(self.key);
    }
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
