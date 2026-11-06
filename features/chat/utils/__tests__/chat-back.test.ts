import { describe, expect, it } from "vitest";

import { canGoBackInApp } from "@/features/chat/utils/chat-back";

const ORIGIN = "https://pt.example.com";

describe("canGoBackInApp", () => {
  it("goes back when the previous page is on the same origin", () => {
    expect(canGoBackInApp(3, `${ORIGIN}/workouts`, ORIGIN)).toBe(true);
  });

  it("falls back when there is no history entry behind this one", () => {
    expect(canGoBackInApp(1, `${ORIGIN}/workouts`, ORIGIN)).toBe(false);
  });

  it("falls back when the referrer is empty (deep link, notification)", () => {
    expect(canGoBackInApp(4, "", ORIGIN)).toBe(false);
  });

  it("falls back when the referrer is another site", () => {
    expect(canGoBackInApp(4, "https://other.example.org/x", ORIGIN)).toBe(
      false,
    );
  });

  it("falls back on an unparseable referrer", () => {
    expect(canGoBackInApp(4, "not a url", ORIGIN)).toBe(false);
  });
});
