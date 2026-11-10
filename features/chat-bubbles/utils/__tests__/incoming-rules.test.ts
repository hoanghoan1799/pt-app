import { describe, expect, it } from "vitest";

import {
  detectIncoming,
  type SeenIds,
} from "@/features/chat-bubbles/utils/incoming-rules";

const base = {
  onScreenKeys: [] as string[],
  mutedKeys: [] as string[],
  enabled: true,
};
const entry = (key: string, id: number | null) => ({
  key,
  latestLoudIncomingId: id,
});

describe("detectIncoming", () => {
  it("the first poll only records the baseline", () => {
    const result = detectIncoming({
      ...base,
      seen: null,
      entries: [entry("user:1", 10)],
    });

    expect(result.popKeys).toEqual([]);
    expect(result.nextSeen).toEqual({ "user:1": 10 });
  });

  it("pops only when the latest loud id grew", () => {
    const seen: SeenIds = { "user:1": 10 };

    expect(
      detectIncoming({ ...base, seen, entries: [entry("user:1", 10)] }).popKeys,
    ).toEqual([]);
    const grown = detectIncoming({
      ...base,
      seen,
      entries: [entry("user:1", 12)],
    });

    expect(grown.popKeys).toEqual(["user:1"]);
    expect(grown.nextSeen).toEqual({ "user:1": 12 });
  });

  it("pops a chat that had nothing unread at the baseline", () => {
    expect(
      detectIncoming({ ...base, seen: {}, entries: [entry("user:2", 3)] })
        .popKeys,
    ).toEqual(["user:2"]);
  });

  it("a read chat (null id) does not pop and keeps its seen id", () => {
    const result = detectIncoming({
      ...base,
      seen: { "user:1": 10 },
      entries: [entry("user:1", null)],
    });

    expect(result.popKeys).toEqual([]);
    expect(result.nextSeen).toEqual({ "user:1": 10 });
  });

  it("never pops the chat on screen, muted chats, or when switched off", () => {
    const seen: SeenIds = { "user:1": 1, "user:2": 1 };
    const entries = [entry("user:1", 5), entry("user:2", 5)];

    expect(
      detectIncoming({ ...base, seen, entries, onScreenKeys: ["user:1"] })
        .popKeys,
    ).toEqual(["user:2"]);
    expect(
      detectIncoming({ ...base, seen, entries, mutedKeys: ["user:2"] }).popKeys,
    ).toEqual(["user:1"]);
    const off = detectIncoming({ ...base, seen, entries, enabled: false });

    expect(off.popKeys).toEqual([]);
    expect(off.nextSeen).toEqual({ "user:1": 5, "user:2": 5 });
  });

  it("an id seen while on screen does not pop later", () => {
    const first = detectIncoming({
      ...base,
      seen: { "user:1": 1 },
      entries: [entry("user:1", 5)],
      onScreenKeys: ["user:1"],
    });
    const second = detectIncoming({
      ...base,
      seen: first.nextSeen,
      entries: [entry("user:1", 5)],
    });

    expect(second.popKeys).toEqual([]);
  });
});
