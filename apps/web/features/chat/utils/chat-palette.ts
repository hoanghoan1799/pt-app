// Bubble colours (KAN-141, spec D4/D5). Accounts store the key, never the hex,
// so the palette can be retuned later. Every `bg` must give white text at
// least WCAG AA contrast (4.5:1); chat-palette.test.ts enforces it.

export const CHAT_PALETTE = [
  { key: "orange", bg: "#c2410c" },
  { key: "red", bg: "#b91c1c" },
  { key: "pink", bg: "#be185d" },
  { key: "purple", bg: "#7e22ce" },
  { key: "indigo", bg: "#4338ca" },
  { key: "blue", bg: "#1d4ed8" },
  { key: "teal", bg: "#0f766e" },
  { key: "green", bg: "#15803d" },
] as const;

export type ChatColorKey = (typeof CHAT_PALETTE)[number]["key"];

export const CHAT_COLOR_KEYS = CHAT_PALETTE.map((entry) => entry.key) as [
  ChatColorKey,
  ...ChatColorKey[],
];

export const DEFAULT_CHAT_COLOR: ChatColorKey = "orange";
export const CHAT_TEXT_ON_COLOR = "#ffffff";

export const isChatColorKey = (value: unknown): value is ChatColorKey =>
  typeof value === "string" &&
  CHAT_PALETTE.some((entry) => entry.key === value);

// Unknown or missing keys (a retuned palette, bad data) fall back to default.
export const chatColorHex = (key: string | null | undefined) =>
  (CHAT_PALETTE.find((entry) => entry.key === key) ?? CHAT_PALETTE[0]).bg;

const channel = (value: number) => {
  const c = value / 255;

  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = (hex: string) => {
  const n = Number.parseInt(hex.replace("#", ""), 16);

  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};

export const contrastRatio = (a: string, b: string) => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );

  return (hi + 0.05) / (lo + 0.05);
};
