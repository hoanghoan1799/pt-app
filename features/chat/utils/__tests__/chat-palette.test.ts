import { describe, expect, it } from "vitest";

import {
  CHAT_PALETTE,
  CHAT_TEXT_ON_COLOR,
  chatColorHex,
  contrastRatio,
  DEFAULT_CHAT_COLOR,
  isChatColorKey,
} from "@/features/chat/utils/chat-palette";

describe("chat palette", () => {
  it("has 8 unique keys and colours", () => {
    expect(CHAT_PALETTE).toHaveLength(8);
    expect(new Set(CHAT_PALETTE.map((c) => c.key)).size).toBe(8);
    expect(new Set(CHAT_PALETTE.map((c) => c.bg)).size).toBe(8);
  });

  it.each(CHAT_PALETTE.map((c) => [c.key, c.bg]))(
    "%s (%s) has WCAG AA contrast with white text",
    (_key, bg) => {
      expect(contrastRatio(CHAT_TEXT_ON_COLOR, bg)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("computes the contrast ratio correctly", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("checks keys and falls back to the default colour", () => {
    expect(isChatColorKey("blue")).toBe(true);
    expect(isChatColorKey("#ff0000")).toBe(false);
    expect(isChatColorKey(null)).toBe(false);
    expect(chatColorHex("nope")).toBe(chatColorHex(DEFAULT_CHAT_COLOR));
    expect(chatColorHex(null)).toBe(chatColorHex(DEFAULT_CHAT_COLOR));
    expect(chatColorHex("teal")).toBe("#0f766e");
  });
});
