import { describe, expect, it } from "vitest";

import { parsePopSetting } from "@/features/chat-bubbles/utils/pop-setting";

describe("parsePopSetting", () => {
  it("is on unless the stored value is 0", () => {
    expect(parsePopSetting(null)).toBe(true);
    expect(parsePopSetting("1")).toBe(true);
    expect(parsePopSetting("0")).toBe(false);
  });
});
