import { TYPING_THROTTLE_MS } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import { TypingLimiter } from "./typing.limiter.js";

describe("TypingLimiter", () => {
  it("relays the first event and drops the ones inside the interval", () => {
    const limiter = new TypingLimiter();

    expect(limiter.allow("s1", 5, 1000)).toBe(true);
    expect(limiter.allow("s1", 5, 1000 + TYPING_THROTTLE_MS - 1)).toBe(false);
    expect(limiter.allow("s1", 5, 1000 + TYPING_THROTTLE_MS)).toBe(true);
  });

  it("counts each socket and conversation on its own", () => {
    const limiter = new TypingLimiter();

    expect(limiter.allow("s1", 5, 0)).toBe(true);
    expect(limiter.allow("s2", 5, 1)).toBe(true);
    expect(limiter.allow("s1", 6, 2)).toBe(true);
    expect(limiter.allow("s1", 5, 3)).toBe(false);
  });

  it("does not stay silent when the clock moves back", () => {
    const limiter = new TypingLimiter();

    expect(limiter.allow("s1", 5, 10_000)).toBe(true);
    expect(limiter.allow("s1", 5, 4_000)).toBe(true);
  });

  it("forgets a socket that left", () => {
    const limiter = new TypingLimiter();

    limiter.allow("s1", 5, 0);
    limiter.forget("s1");
    expect(limiter.allow("s1", 5, 1)).toBe(true);
  });
});
