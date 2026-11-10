export const MAX_BUBBLES = 5;
export const BUBBLE_SIZE = 56;
// Distance kept to the screen edge.
export const EDGE_GAP = 8;
// Each bubble behind the top one sits this far to the side and down.
export const STACK_OFFSET = 5;
export const ROW_GAP = 10;
// The row (expanded) and the lowest/highest resting spot.
export const TOP_MIN = 34;
export const BOTTOM_RESERVED = 90;
// A move shorter than this is a tap.
export const DRAG_THRESHOLD = 8;
export const CLOSE_RADIUS = 80;
export const DEFAULT_ANCHOR = { side: "right", yRatio: 0.25 } as const;
// Panel box under the row.
export const PANEL_TOP = 100;
export const PANEL_GAP = 8;
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_MOVE = 10;
export const HAPTIC_MS = 10;

export const STORAGE_PREFIX = "pt-chat-bubbles:v1:";
export const POP_SETTING_KEY = "pt-chat-bubbles:v1:pop";
export const POP_SETTING_EVENT = "pt-chat-bubbles:pop-change";

export const NAVIGATE_MESSAGE = "pt-chat-bubble:navigate";
export const BUBBLES_URL = "/api/chat/bubbles";
export const MAX_META_IDS = 10;
