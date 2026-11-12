export type BubbleRole = "user" | "admin";

// Where the stack rests: which screen edge and how far down (0..1 of height).
export interface BubbleAnchor {
  side: "left" | "right";
  yRatio: number;
}

export interface BubbleState {
  // Open bubbles, oldest first; the last one is the top of the stack.
  keys: string[];
  // The chat shown in the panel while expanded.
  activeKey: string | null;
  expanded: boolean;
  anchor: BubbleAnchor;
  // People whose bubble never pops by itself (per device).
  muted: string[];
}

// What the host needs to draw one bubble and open its chat.
export interface BubbleMeta {
  key: string;
  userId: number;
  name: string;
  avatarSrc: string | null;
  href: string;
  embedHref: string;
  // The other side's last heartbeat (ISO), null when never seen or hidden.
  lastSeenAt: string | null;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}
