// "4 hiệp × 10-12", "4 hiệp", "10-12" or "" depending on what was filled in.
export const formatVolume = (sets: number | null, reps: string) => {
  const parts = [sets ? `${sets} hiệp` : "", reps.trim()].filter(Boolean);

  return parts.join(" × ");
};
