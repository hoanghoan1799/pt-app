import { historyCursorSchema } from "@/features/chat/utils/chat-rules";

// Only the params that are present go to Zod, so an absent one stays
// undefined instead of coercing to NaN.
export const parseHistoryQuery = (params: URLSearchParams) => {
  const raw: Record<string, string> = {};

  for (const key of ["after", "before"]) {
    const value = params.get(key);

    if (value !== null) {
      raw[key] = value;
    }
  }
  return historyCursorSchema.safeParse(raw);
};

// `readUpTo` (non-negative int) and `enabled` (0 | 1) from the poller; a
// missing or malformed value just disables the 204 fast path.
export const parseKnownState = (params: URLSearchParams) => {
  const readUpTo = params.get("readUpTo");
  const enabled = params.get("enabled");

  return {
    readUpTo:
      readUpTo !== null && /^\d+$/.test(readUpTo)
        ? Number(readUpTo)
        : undefined,
    enabled: enabled === "1" ? true : enabled === "0" ? false : undefined,
  };
};
