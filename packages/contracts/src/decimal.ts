// Strict decimal text: digits with one optional "." or "," ("1,5", ".5", "2."),
// never "1e2" or "0x14" that Number() would also take. Vietnamese keyboards
// type the comma.
const DECIMAL_PATTERN = /^(\d+[.,]?\d*|[.,]\d+)$/;

// NaN when the text is not a plain decimal.
export const parseDecimal = (value: string) => {
  const text = value.trim();

  return DECIMAL_PATTERN.test(text)
    ? Number(text.replace(",", "."))
    : Number.NaN;
};

// Like parseDecimal, but accepts one leading "+", "-" or "−" (typographic
// minus). NaN when the rest is not a plain decimal.
export const parseSignedDecimal = (value: string) => {
  const text = value.trim();
  const isNegative = text.startsWith("-") || text.startsWith("−");
  const isSigned = isNegative || text.startsWith("+");
  const magnitude = parseDecimal(isSigned ? text.slice(1) : text);

  // 0 - x so that "-0" is 0, not -0.
  return isNegative ? 0 - magnitude : magnitude;
};

// True when the number has at most one decimal (1.6, 2), tolerating float noise.
export const isOneDecimal = (value: number) =>
  Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
