import { describe, expect, it } from "vitest";

import { isChatEnabled } from "@/features/chat/utils/chat-permission-rules";

describe("isChatEnabled", () => {
  it("is true only when the flag is true", () => {
    expect(isChatEnabled({ chatEnabled: true })).toBe(true);
  });

  it("is false when locked or never enabled", () => {
    expect(isChatEnabled({ chatEnabled: false })).toBe(false);
    expect(isChatEnabled({ chatEnabled: null })).toBe(false);
  });

  it("is false when the column is missing from the row", () => {
    expect(
      isChatEnabled({} as unknown as { chatEnabled: boolean | null }),
    ).toBe(false);
  });
});
