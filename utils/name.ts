// Collapses whitespace so "  Nam   Nguyen " is stored as "Nam Nguyen".
export const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");

// Login key: whitespace-collapsed, lower-cased and accent-free, so "nguyen van
// an", "NGUYỄN VĂN AN" and "Nguyễn  Văn An" all reach the same user — people
// often type without Vietnamese accents on their phone.
export const toNameKey = (name: string) =>
  normalizeName(name)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();

export const getInitial = (name: string) =>
  normalizeName(name).charAt(0).toLocaleUpperCase("vi");

// Up to two letters for the round PT avatar.
export const initialsOf = (name: string | null) => {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "PT";
  }
  const letters =
    words.length === 1
      ? Array.from(words[0]).slice(0, 2)
      : [Array.from(words[0])[0], Array.from(words[words.length - 1])[0]];

  return letters.join("").toUpperCase();
};
