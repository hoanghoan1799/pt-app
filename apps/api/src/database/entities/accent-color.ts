// An app primary color as the web app stores it: normalized lower-case
// "#rrggbb" (company/main features/theme/utils/color.ts normalizeHex). NULL
// passes, as in every CHECK.
export const ACCENT_COLOR_PATTERN = "^#[0-9a-f]{6}$";

export const accentColorCheck = (column: string) =>
  `"${column}" ~ '${ACCENT_COLOR_PATTERN}'`;
