import { describe, expect, it } from "vitest";

import {
  bubbleReducer,
  EMPTY_BUBBLE_STATE,
  fromPersisted,
  parseBubbles,
  serializeBubbles,
} from "@/features/chat-bubbles/utils/bubble-store";

const open = (keys: string[]) =>
  keys.reduce(
    (state, key) => bubbleReducer(state, { type: "open", key }),
    EMPTY_BUBBLE_STATE,
  );

describe("bubbleReducer", () => {
  it("open dedupes and moves the chat to the top", () => {
    const state = bubbleReducer(open(["user:1", "user:2"]), {
      type: "open",
      key: "user:1",
    });

    expect(state.keys).toEqual(["user:2", "user:1"]);
  });

  it("keeps at most 5 and drops the oldest", () => {
    const state = open([
      "user:1",
      "user:2",
      "user:3",
      "user:4",
      "user:5",
      "user:6",
    ]);

    expect(state.keys).toEqual([
      "user:2",
      "user:3",
      "user:4",
      "user:5",
      "user:6",
    ]);
  });

  it("close removes the key and the panel moves to the new top", () => {
    let state = open(["user:1", "user:2"]);

    state = bubbleReducer(state, { type: "expand", key: "user:2" });
    state = bubbleReducer(state, { type: "close", key: "user:2" });
    expect(state.keys).toEqual(["user:1"]);
    expect(state.activeKey).toBe("user:1");
    expect(state.expanded).toBe(true);
  });

  it("closing the last bubble collapses and clears the active chat", () => {
    let state = bubbleReducer(open(["user:1"]), {
      type: "expand",
      key: "user:1",
    });

    state = bubbleReducer(state, { type: "close", key: "user:1" });
    expect(state).toMatchObject({ keys: [], activeKey: null, expanded: false });
  });

  it("expand needs an open bubble; collapse clears the active chat", () => {
    const base = open(["user:1"]);

    expect(bubbleReducer(base, { type: "expand", key: "user:9" })).toBe(base);
    const expanded = bubbleReducer(base, { type: "expand", key: "user:1" });

    expect(expanded).toMatchObject({ expanded: true, activeKey: "user:1" });
    expect(bubbleReducer(expanded, { type: "collapse" })).toMatchObject({
      expanded: false,
      activeKey: null,
    });
  });

  it("closeAll empties the stack", () => {
    const state = bubbleReducer(open(["user:1", "user:2"]), {
      type: "closeAll",
    });

    expect(state.keys).toEqual([]);
  });

  it("mute remembers the person and closes their bubble; unmute undoes it", () => {
    const muted = bubbleReducer(open(["user:1", "user:2"]), {
      type: "mute",
      key: "user:1",
    });

    expect(muted.keys).toEqual(["user:2"]);
    expect(muted.muted).toEqual(["user:1"]);
    expect(bubbleReducer(muted, { type: "mute", key: "user:1" }).muted).toEqual(
      ["user:1"],
    );
    expect(
      bubbleReducer(muted, { type: "unmute", key: "user:1" }).muted,
    ).toEqual([]);
  });

  it("prune drops bubbles the server no longer returns", () => {
    const state = bubbleReducer(open(["user:1", "user:2"]), {
      type: "prune",
      allowed: ["user:2"],
    });

    expect(state.keys).toEqual(["user:2"]);
  });
});

describe("persistence", () => {
  it("round-trips keys, anchor and muted", () => {
    const state = bubbleReducer(
      bubbleReducer(open(["user:1", "user:2"]), {
        type: "setAnchor",
        anchor: { side: "left", yRatio: 0.4 },
      }),
      { type: "mute", key: "user:3" },
    );
    const parsed = parseBubbles("admin", serializeBubbles(state));

    expect(fromPersisted(parsed)).toMatchObject({
      keys: ["user:1", "user:2"],
      anchor: { side: "left", yRatio: 0.4 },
      muted: ["user:3"],
    });
  });

  it.each([null, "", "{", "null", "[]", "42", '"x"'])(
    "falls back to defaults for %j",
    (raw) => {
      expect(parseBubbles("admin", raw)).toEqual({
        keys: [],
        anchor: { side: "right", yRatio: 0.25 },
        muted: [],
      });
    },
  );

  it("drops foreign keys, duplicates and out-of-range anchors", () => {
    const raw = JSON.stringify({
      keys: ["coach", "user:1", "user:1", "user:0", 7, "user:2"],
      anchor: { side: "middle", yRatio: 9 },
      muted: ["user:x", "user:4"],
    });

    expect(parseBubbles("admin", raw)).toEqual({
      keys: ["user:1", "user:2"],
      anchor: { side: "right", yRatio: 1 },
      muted: ["user:4"],
    });
    expect(parseBubbles("user", raw).keys).toEqual(["coach"]);
  });
});
