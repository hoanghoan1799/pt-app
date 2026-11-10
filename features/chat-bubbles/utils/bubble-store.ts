import { DEFAULT_ANCHOR, MAX_BUBBLES } from "@/features/chat-bubbles/constants";
import type {
  BubbleAnchor,
  BubbleRole,
  BubbleState,
} from "@/features/chat-bubbles/types";
import { isKeyForRole } from "@/features/chat-bubbles/utils/bubble-links";

export const EMPTY_BUBBLE_STATE: BubbleState = {
  keys: [],
  activeKey: null,
  expanded: false,
  anchor: DEFAULT_ANCHOR,
  muted: [],
};

export type BubbleAction =
  // Make `key` the top of the stack (dedupes; the oldest drops past the max).
  | { type: "open"; key: string }
  | { type: "close"; key: string }
  | { type: "closeAll" }
  | { type: "expand"; key: string }
  | { type: "collapse" }
  | { type: "setAnchor"; anchor: BubbleAnchor }
  | { type: "mute"; key: string }
  | { type: "unmute"; key: string }
  // Keep only these keys (the server no longer knows the others).
  | { type: "prune"; allowed: readonly string[] }
  // Persisted fields from another tab; local expanded/active state stays.
  | { type: "sync"; persisted: Persisted };

const withoutKey = (keys: readonly string[], key: string) =>
  keys.filter((item) => item !== key);

// The panel needs an active chat that still has a bubble.
const settle = (state: BubbleState): BubbleState => {
  const top = state.keys[state.keys.length - 1] ?? null;

  if (!state.expanded) {
    return state.activeKey === null ? state : { ...state, activeKey: null };
  }
  if (top === null) {
    return { ...state, expanded: false, activeKey: null };
  }
  return state.activeKey !== null && state.keys.includes(state.activeKey)
    ? state
    : { ...state, activeKey: top };
};

export const bubbleReducer = (
  state: BubbleState,
  action: BubbleAction,
): BubbleState => {
  switch (action.type) {
    case "open": {
      const keys = [...withoutKey(state.keys, action.key), action.key].slice(
        -MAX_BUBBLES,
      );

      return settle({ ...state, keys });
    }
    case "close":
      return settle({ ...state, keys: withoutKey(state.keys, action.key) });
    case "closeAll":
      return { ...state, keys: [], activeKey: null, expanded: false };
    case "expand":
      return state.keys.includes(action.key)
        ? { ...state, expanded: true, activeKey: action.key }
        : state;
    case "collapse":
      return state.expanded || state.activeKey !== null
        ? { ...state, expanded: false, activeKey: null }
        : state;
    case "setAnchor":
      return { ...state, anchor: action.anchor };
    case "mute":
      return settle({
        ...state,
        muted: state.muted.includes(action.key)
          ? state.muted
          : [...state.muted, action.key],
        keys: withoutKey(state.keys, action.key),
      });
    case "unmute":
      return { ...state, muted: withoutKey(state.muted, action.key) };
    case "prune": {
      const keys = state.keys.filter((key) => action.allowed.includes(key));

      return keys.length === state.keys.length
        ? state
        : settle({ ...state, keys });
    }
    case "sync":
      return settle({
        ...state,
        keys: action.persisted.keys,
        anchor: action.persisted.anchor,
        muted: action.persisted.muted,
      });
  }
};

// ---- Persistence (localStorage, per role) ----

export interface Persisted {
  keys: string[];
  anchor: BubbleAnchor;
  muted: string[];
}

export const toPersisted = (state: BubbleState): Persisted => ({
  keys: state.keys,
  anchor: state.anchor,
  muted: state.muted,
});

export const serializeBubbles = (state: BubbleState) =>
  JSON.stringify(toPersisted(state));

const parseAnchor = (value: unknown): BubbleAnchor => {
  const record = (typeof value === "object" && value !== null ? value : {}) as {
    side?: unknown;
    yRatio?: unknown;
  };
  const ratio = record.yRatio;

  return {
    side: record.side === "left" ? "left" : "right",
    yRatio:
      typeof ratio === "number" && Number.isFinite(ratio)
        ? Math.min(1, Math.max(0, ratio))
        : DEFAULT_ANCHOR.yRatio,
  };
};

const parseKeys = (role: BubbleRole, value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.filter((key) => isKeyForRole(role, key)))]
    : [];

// Never throws: bad JSON, wrong shapes and foreign keys fall back to defaults.
export const parseBubbles = (
  role: BubbleRole,
  raw: string | null,
): Persisted => {
  let data: unknown = null;

  try {
    data = raw === null ? null : JSON.parse(raw);
  } catch {
    data = null;
  }
  const record = (typeof data === "object" && data !== null ? data : {}) as {
    keys?: unknown;
    anchor?: unknown;
    muted?: unknown;
  };

  return {
    keys: parseKeys(role, record.keys).slice(-MAX_BUBBLES),
    anchor: parseAnchor(record.anchor),
    muted: parseKeys(role, record.muted),
  };
};

export const fromPersisted = (persisted: Persisted): BubbleState => ({
  ...EMPTY_BUBBLE_STATE,
  ...persisted,
});
