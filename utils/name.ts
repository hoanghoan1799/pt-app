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
