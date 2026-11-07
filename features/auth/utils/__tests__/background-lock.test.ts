import { describe, expect, it } from "vitest";

import { shouldLockAfterHidden } from "@/features/auth/utils/background-lock";

describe("shouldLockAfterHidden", () => {
  it("does not lock when the page was never hidden", () => {
    expect(shouldLockAfterHidden(null, 1_000_000)).toBe(false);
  });

  it("does not lock just under 5 minutes", () => {
    expect(shouldLockAfterHidden(0, 299_999)).toBe(false);
  });

  it("locks at exactly 5 minutes and after", () => {
    expect(shouldLockAfterHidden(0, 300_000)).toBe(true);
    expect(shouldLockAfterHidden(0, 3_600_000)).toBe(true);
  });
});
