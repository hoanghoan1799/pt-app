// Case- and diacritics-insensitive text for the admin inbox search (KAN-164).
// "đ" has no decomposed form, so it is mapped by hand.
export const normalizeSearchText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();

// True when any of the names contains the query; an empty query matches all.
export const matchesInboxSearch = (
  query: string,
  ...names: readonly string[]
): boolean => {
  const needle = normalizeSearchText(query);

  if (needle === "") {
    return true;
  }
  return names.some((name) => normalizeSearchText(name).includes(needle));
};

const PASSCODE_PATTERN = /^[0-9]{4}$/;

// Exactly four ASCII digits (surrounding spaces ignored) may be a passcode.
export const asPasscodeQuery = (query: string): string | null => {
  const trimmed = query.trim();

  return PASSCODE_PATTERN.test(trimmed) ? trimmed : null;
};
