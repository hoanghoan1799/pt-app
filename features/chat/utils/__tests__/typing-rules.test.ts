import { describe, expect, it } from "vitest";

import {
  isTypingActive,
  shouldSendTyping,
  TYPING_EXPIRY_MS,
  TYPING_THROTTLE_MS,
} from "@/features/chat/utils/typing-rules";

describe("typing constants", () => {
  it("keeps expiry longer than the throttle so typing does not flicker", () => {
    expect(TYPING_THROTTLE_MS).toBe(2500);
    expect(TYPING_EXPIRY_MS).toBe(5000);
    expect(TYPING_EXPIRY_MS).toBeGreaterThan(TYPING_THROTTLE_MS);
  });
});

describe("shouldSendTyping", () => {
  it("sends the first time", () => {
    expect(shouldSendTyping(null, 1000)).toBe(true);
  });

  it("holds back inside the throttle window", () => {
    expect(shouldSendTyping(1000, 1000)).toBe(false);
    expect(shouldSendTyping(1000, 1000 + TYPING_THROTTLE_MS - 1)).toBe(false);
  });

  it("sends again once the interval has passed", () => {
    expect(shouldSendTyping(1000, 1000 + TYPING_THROTTLE_MS)).toBe(true);
  });

  it("sends when the clock moved backwards", () => {
    expect(shouldSendTyping(5000, 1000)).toBe(true);
  });
});

describe("isTypingActive", () => {
  it("is inactive before any event", () => {
    expect(isTypingActive(null, 1000)).toBe(false);
  });

  it("is active until the expiry", () => {
    expect(isTypingActive(1000, 1000)).toBe(true);
    expect(isTypingActive(1000, 1000 + TYPING_EXPIRY_MS - 1)).toBe(true);
  });

  it("expires exactly at the expiry", () => {
    expect(isTypingActive(1000, 1000 + TYPING_EXPIRY_MS)).toBe(false);
  });

  it("ignores an event stamped in the future", () => {
    expect(isTypingActive(5000, 1000)).toBe(false);
  });
});
