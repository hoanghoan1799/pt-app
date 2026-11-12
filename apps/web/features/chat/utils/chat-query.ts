// What the polling client sends, as the API's query: only numbers that look
// like numbers go on, so a malformed value is dropped (the client then gets
// the full payload, never an error) and an absent one stays undefined.

const DIGITS = /^\d{1,15}$/;

const numberOf = (params: URLSearchParams, key: string) => {
  const value = params.get(key);

  return value !== null && DIGITS.test(value) ? Number(value) : undefined;
};

export const threadQueryOf = (params: URLSearchParams) => {
  const enabled = params.get("enabled");

  return {
    after: numberOf(params, "after"),
    before: numberOf(params, "before"),
    around: numberOf(params, "around"),
    readUpTo: numberOf(params, "readUpTo"),
    enabled: enabled === "1" || enabled === "0" ? enabled : undefined,
    changedSince: numberOf(params, "changedSince"),
  } as {
    after?: number;
    before?: number;
    around?: number;
    readUpTo?: number;
    enabled?: "0" | "1";
    changedSince?: number;
  };
};
